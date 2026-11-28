import { initAdminPage } from '../admin-shell.js';
import { getSupabase } from '../supabase-client.js';
import { apiFetch } from '../api.js';
import { formatEventDate } from '../events.js';
import { confirmDialog, escapeHtml, renderSkeleton, toast } from '../ui.js';
import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm';

const root = document.getElementById('attendees-root');
const params = new URLSearchParams(window.location.search);
const eventId = params.get('event')?.trim() || '';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 50;

let eventData = null;
let totalRegistered = 0;
let totalCheckedIn = 0;
let rows = [];
let totalFiltered = 0;
let page = 0;
let filterStatus = 'all'; // all | checked_in | not_checked_in
let searchQuery = '';
let sortCol = 'created_at'; // full_name | created_at | checked_in
let sortAsc = false;
let searchTimer = null;

function formatManilaTime(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

function renderShell() {
  const notChecked = Math.max(0, totalRegistered - totalCheckedIn);
  const pct = totalRegistered > 0 ? Math.round((totalCheckedIn / totalRegistered) * 100) : 0;

  root.innerHTML = `
    <div class="stack-sm">
      <div><a href="/admin" class="muted" style="font-weight:500;">‹ Events</a></div>
      <div class="row-between">
        <div>
          <h1 style="margin:0;font-size:1.5rem;">${escapeHtml(eventData.title)}</h1>
          <div class="muted" style="font-size:0.875rem;">${escapeHtml(formatEventDate(eventData.starts_at, eventData.ends_at))} · ${escapeHtml(eventData.venue || 'TBA')}</div>
        </div>
        <div class="row">
          <a href="/admin/scanner?event=${encodeURIComponent(eventId)}" class="btn btn-primary btn-sm">Scan</a>
          <button type="button" id="export-csv-btn" class="btn btn-secondary btn-sm">Export CSV</button>
        </div>
      </div>
    </div>

    <section class="counters-grid">
      <div class="card stack-sm" style="gap:4px;">
        <span class="muted" style="font-size:0.8125rem;">Registered</span>
        <strong style="font-size:1.5rem;" id="cnt-registered">${escapeHtml(String(totalRegistered))} / ${escapeHtml(String(eventData.capacity || '—'))}</strong>
      </div>
      <div class="card stack-sm" style="gap:4px;">
        <span class="muted" style="font-size:0.8125rem;">Checked in</span>
        <strong style="font-size:1.5rem;color:var(--success);" id="cnt-checked">${escapeHtml(String(totalCheckedIn))}</strong>
        <div style="height:6px;background:var(--surface-subtle);border-radius:999px;overflow:hidden;">
          <div id="cnt-bar" style="height:100%;background:var(--success);width:${pct}%;"></div>
        </div>
      </div>
      <div class="card stack-sm" style="gap:4px;">
        <span class="muted" style="font-size:0.8125rem;">Not yet checked in</span>
        <strong style="font-size:1.5rem;" id="cnt-not-checked">${escapeHtml(String(notChecked))}</strong>
      </div>
    </section>

    <section class="stack">
      <div class="row-between">
        <div class="row">
          <div class="tabs" role="tablist" aria-label="Check-in filter">
            <button type="button" class="tab-btn" role="tab" data-status="all" aria-selected="true">All</button>
            <button type="button" class="tab-btn" role="tab" data-status="checked_in" aria-selected="false">Checked in</button>
            <button type="button" class="tab-btn" role="tab" data-status="not_checked_in" aria-selected="false">Not checked in</button>
          </div>
          <label class="sr-only" for="att-search">Search attendees</label>
          <input id="att-search" class="input" type="search" placeholder="Name, email, org, or ticket ID…" style="width:240px;">
        </div>
        <div class="row">
          <span id="last-updated" class="muted" style="font-size:0.8125rem;"></span>
          <button type="button" id="att-refresh-btn" class="btn btn-secondary btn-sm">Refresh</button>
        </div>
      </div>

      <div id="att-table-container"></div>
    </section>
  `;

  document.getElementById('export-csv-btn').addEventListener('click', exportCsv);
  document.getElementById('att-refresh-btn').addEventListener('click', () => loadAttendees());

  const searchEl = document.getElementById('att-search');
  searchEl.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      searchQuery = searchEl.value.trim();
      page = 0;
      loadAttendees();
    }, 250);
  });

  root.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterStatus = btn.dataset.status;
      page = 0;
      root.querySelectorAll('[data-status]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
      loadAttendees();
    });
  });
}

function updateCountersUi() {
  const notChecked = Math.max(0, totalRegistered - totalCheckedIn);
  const pct = totalRegistered > 0 ? Math.round((totalCheckedIn / totalRegistered) * 100) : 0;
  const regEl = document.getElementById('cnt-registered');
  const chkEl = document.getElementById('cnt-checked');
  const notEl = document.getElementById('cnt-not-checked');
  const barEl = document.getElementById('cnt-bar');
  if (regEl) regEl.textContent = `${totalRegistered} / ${eventData.capacity || '—'}`;
  if (chkEl) chkEl.textContent = String(totalCheckedIn);
  if (notEl) notEl.textContent = String(notChecked);
  if (barEl) barEl.style.width = `${pct}%`;
}

function renderTable() {
  const container = document.getElementById('att-table-container');
  if (!container) return;

  if (totalRegistered === 0 && !searchQuery && filterStatus === 'all') {
    container.innerHTML = `<div class="empty-state"><p class="muted" style="margin:0;">No registrations yet.</p></div>`;
    return;
  }

  if (rows.length === 0) {
    container.innerHTML = `
      <div class="empty-state stack-sm">
        <p class="muted" style="margin:0;">No attendees match your search.</p>
        <div><button type="button" class="btn btn-secondary btn-sm" id="att-clear-btn">Clear</button></div>
      </div>
    `;
    document.getElementById('att-clear-btn')?.addEventListener('click', () => {
      searchQuery = '';
      filterStatus = 'all';
      page = 0;
      const s = document.getElementById('att-search');
      if (s) s.value = '';
      root.querySelectorAll('[data-status]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.status === 'all')));
      loadAttendees();
    });
    return;
  }

  const ariaSort = (col) => (sortCol === col ? (sortAsc ? 'ascending' : 'descending') : 'none');

  const bodyHtml = rows
    .map((r) => {
      const statusHtml = r.checked_in
        ? `<span class="chip chip-success">Checked in · ${escapeHtml(formatManilaTime(r.checked_in_at))}</span>`
        : `<span class="chip chip-muted">Not checked in</span>`;

      const actionItem = r.checked_in
        ? `<button type="button" class="dropdown-item" data-action="uncheckin" data-id="${escapeHtml(r.id)}">Undo check-in</button>`
        : `<button type="button" class="dropdown-item" data-action="checkin" data-id="${escapeHtml(r.id)}">Check in</button>`;

      return `
        <tr data-reg-id="${escapeHtml(r.id)}">
          <td data-label="Name"><div class="attendee-identity"><img class="attendee-qr" data-qr-ticket="${escapeHtml(r.ticket_id)}" alt="QR invite for ${escapeHtml(r.full_name)}" width="56" height="56"><strong>${escapeHtml(r.full_name)}</strong></div></td>
          <td data-label="Email">${escapeHtml(r.email)}</td>
          <td data-label="Organization">${escapeHtml(r.organization)}</td>
          <td data-label="Contact">${escapeHtml(r.contact_number)}</td>
          <td data-label="Ticket ID" class="mono">${escapeHtml(r.ticket_id)}</td>
          <td data-label="Registered">${escapeHtml(formatManilaTime(r.created_at))}</td>
          <td data-label="Status">${statusHtml}</td>
          <td data-label="Actions">
            <div style="position:relative;display:inline-block;">
              <button type="button" class="btn btn-ghost btn-sm" data-action="row-menu" aria-expanded="false" aria-label="Actions for ${escapeHtml(r.full_name)}">⋯</button>
              <div class="dropdown-menu" role="menu" hidden>
                ${actionItem}
                <button type="button" class="dropdown-item" data-action="resend-qr" data-id="${escapeHtml(r.id)}">Resend QR email</button>
                <button type="button" class="dropdown-item" data-action="copy-id" data-ticket="${escapeHtml(r.ticket_id)}">Copy ticket ID</button>
              </div>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));

  container.innerHTML = `
    <div class="table-wrap table-wrap--cards">
      <table class="data-table">
        <thead>
          <tr>
            <th aria-sort="${ariaSort('full_name')}"><button type="button" class="sort-btn" data-sort="full_name">Attendee</button></th>
            <th>Email</th>
            <th>Organization</th>
            <th>Contact</th>
            <th>Ticket ID</th>
            <th aria-sort="${ariaSort('created_at')}"><button type="button" class="sort-btn" data-sort="created_at">Registered</button></th>
            <th aria-sort="${ariaSort('checked_in')}"><button type="button" class="sort-btn" data-sort="checked_in">Status</button></th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
    <div class="row-between" style="padding-top:12px;">
      <span class="muted" style="font-size:0.875rem;">Showing ${rows.length} of ${totalFiltered} attendees (page ${page + 1} of ${totalPages})</span>
      <div class="row">
        <button type="button" class="btn btn-secondary btn-sm" id="prev-page-btn" ${page === 0 ? 'disabled' : ''}>Previous</button>
        <button type="button" class="btn btn-secondary btn-sm" id="next-page-btn" ${page + 1 >= totalPages ? 'disabled' : ''}>Next</button>
      </div>
    </div>
  `;

  Promise.all(rows.map(async (r) => {
    const img = container.querySelector(`[data-qr-ticket="${CSS.escape(r.ticket_id)}"]`);
    if (!img) return;
    try {
      img.src = await QRCode.toDataURL(r.ticket_id, { width: 112, margin: 1, errorCorrectionLevel: 'M' });
    } catch {
      img.hidden = true;
    }
  }));

  container.querySelectorAll('[data-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const col = btn.dataset.sort;
      if (sortCol === col) sortAsc = !sortAsc;
      else {
        sortCol = col;
        sortAsc = col === 'full_name';
      }
      page = 0;
      loadAttendees();
    });
  });

  document.getElementById('prev-page-btn')?.addEventListener('click', () => {
    if (page > 0) {
      page -= 1;
      loadAttendees();
    }
  });
  document.getElementById('next-page-btn')?.addEventListener('click', () => {
    if (page + 1 < totalPages) {
      page += 1;
      loadAttendees();
    }
  });

  container.querySelectorAll('[data-action="row-menu"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const regId = btn.closest('tr')?.dataset.regId;
      const menu = document.querySelector(`.attendee-menu-floating[data-owner="${CSS.escape(regId || '')}"]`) || btn.nextElementSibling;
      const open = !menu.hidden;
      closeRowMenus();
      if (!open) {
        const rect = btn.getBoundingClientRect();
        menu.hidden = false;
        menu.classList.add('attendee-menu-floating');
        document.body.appendChild(menu);
        const menuRect = menu.getBoundingClientRect();
        const top = rect.bottom + menuRect.height <= window.innerHeight - 8
          ? rect.bottom + 6
          : Math.max(8, rect.top - menuRect.height - 6);
        menu.style.left = `${Math.max(8, Math.min(rect.right - menuRect.width, window.innerWidth - menuRect.width - 8))}px`;
        menu.style.top = `${top}px`;
        menu.dataset.owner = regId;
      }
      btn.setAttribute('aria-expanded', String(!open));
      if (open) menu.hidden = true;
    });
  });
  container.querySelectorAll('.dropdown-menu').forEach((menu) => {
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
      closeRowMenus();
    });
  });

  container.querySelectorAll('[data-action="checkin"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const r = rows.find((item) => item.id === btn.dataset.id);
      if (!r) return;
      const ok = await confirmDialog({
        title: 'Check in attendee?',
        message: `Check in ${r.full_name} (${r.ticket_id})?`,
        confirmText: 'Check in',
      });
      if (!ok) return;
      try {
        const res = await apiFetch('/api/checkin', {
          method: 'POST',
          body: { ticket_id: r.ticket_id, event_id: eventId },
        });
        r.checked_in = true;
        r.checked_in_at = res.checked_in_at;
        totalCheckedIn += 1;
        updateCountersUi();
        renderTable();
        toast(`${r.full_name} checked in.`, { type: 'success' });
      } catch (err) {
        toast(err.message || 'Check-in failed.', { type: 'danger' });
      }
    });
  });

  container.querySelectorAll('[data-action="uncheckin"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const r = rows.find((item) => item.id === btn.dataset.id);
      if (!r) return;
      const ok = await confirmDialog({
        title: 'Undo check-in?',
        message: `Mark ${r.full_name} (${r.ticket_id}) as not checked in?`,
        confirmText: 'Undo check-in',
        danger: true,
      });
      if (!ok) return;
      try {
        await apiFetch('/api/admin/uncheckin', {
          method: 'POST',
          body: { ticket_id: r.ticket_id, event_id: eventId },
        });
        r.checked_in = false;
        r.checked_in_at = null;
        totalCheckedIn = Math.max(0, totalCheckedIn - 1);
        updateCountersUi();
        renderTable();
        toast('Check-in undone.', { type: 'info' });
      } catch (err) {
        toast(err.message || 'Could not undo check-in.', { type: 'danger' });
      }
    });
  });

  container.querySelectorAll('[data-action="resend-qr"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const r = rows.find((item) => item.id === btn.dataset.id);
      if (!r) return;
      try {
        const res = await apiFetch('/api/admin/resend-qr', {
          method: 'POST',
          body: { ticket_id: r.ticket_id },
        });
        toast(res.qr_sent ? `QR email sent to ${r.email}.` : 'Email could not be sent right now.', {
          type: res.qr_sent ? 'success' : 'warning',
        });
      } catch (err) {
        toast(err.message || 'Resend failed.', { type: 'danger' });
      }
    });
  });

  container.querySelectorAll('[data-action="copy-id"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.ticket);
        toast('Ticket ID copied.', { type: 'success' });
      } catch {
        toast('Could not copy Ticket ID.', { type: 'danger' });
      }
    });
  });
}

function closeRowMenus() {
  document.querySelectorAll('.attendee-menu-floating').forEach((menu) => {
    menu.hidden = true;
    const regId = menu.dataset.owner;
    menu.classList.remove('attendee-menu-floating');
    menu.style.left = '';
    menu.style.top = '';
    delete menu.dataset.owner;
    const trigger = root.querySelector(`[data-reg-id="${CSS.escape(regId || '')}"] [data-action="row-menu"]`);
    trigger?.setAttribute('aria-expanded', 'false');
    if (trigger?.parentElement) trigger.parentElement.appendChild(menu);
  });
  root.querySelectorAll('.dropdown-menu').forEach((menu) => { menu.hidden = true; });
}

document.addEventListener('click', closeRowMenus);
window.addEventListener('scroll', closeRowMenus, true);

async function exportCsv() {
  const btn = document.getElementById('export-csv-btn');
  btn.disabled = true;
  btn.textContent = 'Exporting…';
  try {
    const { blob, headers } = await apiFetch(`/api/admin/export?event_id=${encodeURIComponent(eventId)}`, {
      responseType: 'blob',
    });
    const disp = headers.get('content-disposition') || '';
    const match = disp.match(/filename="([^"]+)"/i);
    const filename = match ? match[1] : `registrations-${eventId}.csv`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast(err.message || 'CSV export failed.', { type: 'danger' });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Export CSV';
  }
}

async function loadCounters() {
  const supabase = getSupabase();
  const { data } = await supabase.rpc('admin_event_stats');
  const st = (data || []).find((s) => s.event_id === eventId);
  totalRegistered = st?.registered_count || 0;
  totalCheckedIn = st?.checked_in_count || 0;
  updateCountersUi();
}

async function loadAttendees() {
  const container = document.getElementById('att-table-container');
  if (container && rows.length === 0) {
    container.innerHTML = renderSkeleton('row', 4);
  }
  try {
    const supabase = getSupabase();
    let query = supabase
      .from('registrations')
      .select('id, ticket_id, full_name, email, organization, contact_number, created_at, checked_in, checked_in_at', { count: 'exact' })
      .eq('event_id', eventId);

    if (filterStatus === 'checked_in') query = query.eq('checked_in', true);
    else if (filterStatus === 'not_checked_in') query = query.eq('checked_in', false);

    if (searchQuery) {
      const safe = searchQuery.replace(/[,%()]/g, '');
      if (safe) {
        query = query.or(
          `full_name.ilike.%${safe}%,email.ilike.%${safe}%,organization.ilike.%${safe}%,ticket_id.ilike.%${safe}%`
        );
      }
    }

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    query = query.order(sortCol, { ascending: sortAsc }).range(from, to);

    const [{ data, count, error }] = await Promise.all([query, loadCounters()]);
    if (error) throw error;

    rows = data || [];
    totalFiltered = count ?? rows.length;
    const upd = document.getElementById('last-updated');
    if (upd) {
      upd.textContent = `Updated ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
    }
    renderTable();
  } catch (err) {
    if (container) {
      container.innerHTML = `
        <div class="empty-state stack-sm">
          <p class="muted">${escapeHtml(err.message || 'Could not load attendees.')}</p>
          <div><button type="button" class="btn btn-primary btn-sm" id="att-retry-btn">Retry</button></div>
        </div>
      `;
      document.getElementById('att-retry-btn')?.addEventListener('click', loadAttendees);
    }
  }
}

async function init() {
  const auth = await initAdminPage({ active: 'events' });
  if (!auth) return;

  if (!UUID_RE.test(eventId)) {
    root.innerHTML = `<div class="empty-state stack-sm"><h2>Event not found</h2><div><a href="/admin" class="btn btn-primary">Back to events</a></div></div>`;
    return;
  }

  root.innerHTML = renderSkeleton('row', 4);
  try {
    const supabase = getSupabase();
    const { data: ev, error } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle();
    if (error) throw error;
    if (!ev) {
      root.innerHTML = `<div class="empty-state stack-sm"><h2>Event not found</h2><div><a href="/admin" class="btn btn-primary">Back to events</a></div></div>`;
      return;
    }

    eventData = ev;
    renderShell();
    await loadAttendees();

    // Realtime subscription with 15s polling fallback
    let realtimeActive = false;
    const channel = supabase
      .channel(`attendees-${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'registrations', filter: `event_id=eq.${eventId}` },
        () => {
          loadAttendees();
        }
      )
      .subscribe((status) => {
        realtimeActive = status === 'SUBSCRIBED';
      });

    window.setInterval(() => {
      if (!realtimeActive && document.visibilityState === 'visible') {
        loadAttendees();
      }
    }, 15_000);

    window.addEventListener('beforeunload', () => {
      supabase.removeChannel(channel);
    });
  } catch (err) {
    root.innerHTML = `<div class="banner banner-danger">${escapeHtml(err.message || 'Failed to load attendee page.')}</div>`;
  }
}

init();
