import { initAdminPage } from '../admin-shell.js';
import { getSupabase } from '../supabase-client.js';
import { formatEventDate, getEventPhase, getPhaseBadge } from '../events.js';
import { confirmDialog, escapeHtml, renderSkeleton, toast } from '../ui.js';

const wrap = document.getElementById('dashboard-table-wrap');
const searchInput = document.getElementById('dash-search');
const sortSelect = document.getElementById('dash-sort');
const filterButtons = Array.from(document.querySelectorAll('#filter-chips [role="tab"]'));

const urlParams = new URLSearchParams(window.location.search);
let activeFilter = urlParams.get('filter') || 'all';
let searchQuery = urlParams.get('q') || '';
let sortBy = urlParams.get('sort') || 'newest';

let events = [];
let checkedInToday = 0;
let searchTimer = null;

searchInput.value = searchQuery;
sortSelect.value = sortBy;
filterButtons.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.filter === activeFilter)));

function syncUrl() {
  const p = new URLSearchParams();
  if (activeFilter !== 'all') p.set('filter', activeFilter);
  if (searchQuery.trim()) p.set('q', searchQuery.trim());
  if (sortBy !== 'newest') p.set('sort', sortBy);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
}

function updateStats() {
  const now = new Date();
  const upcomingCount = events.filter((e) => e.status === 'published' && getEventPhase(e, now) === 'upcoming').length;
  const totalRegs = events.reduce((acc, e) => acc + (e.registered_count || 0), 0);

  document.getElementById('stat-total').textContent = String(events.length);
  document.getElementById('stat-upcoming').textContent = String(upcomingCount);
  document.getElementById('stat-regs').textContent = String(totalRegs);
  document.getElementById('stat-today').textContent = String(checkedInToday);
}

function getFilteredEvents() {
  const now = new Date();
  const q = searchQuery.trim().toLowerCase();

  const filtered = events.filter((ev) => {
    if (q && !(ev.title || '').toLowerCase().includes(q) && !(ev.venue || '').toLowerCase().includes(q)) {
      return false;
    }
    const phase = getEventPhase(ev, now);
    if (activeFilter === 'draft') return ev.status === 'draft';
    if (activeFilter === 'cancelled') return ev.status === 'cancelled';
    if (activeFilter === 'live') return ev.status === 'published' && phase === 'live';
    if (activeFilter === 'upcoming') return ev.status === 'published' && phase === 'upcoming';
    if (activeFilter === 'past') return ev.status === 'published' && phase === 'past';
    return true;
  });

  filtered.sort((a, b) => {
    if (sortBy === 'most_registered') {
      return (b.registered_count || 0) - (a.registered_count || 0);
    }
    const aTime = a.starts_at ? new Date(a.starts_at).getTime() : 0;
    const bTime = b.starts_at ? new Date(b.starts_at).getTime() : 0;
    return sortBy === 'oldest' ? aTime - bTime : bTime - aTime;
  });

  return filtered;
}

function statusChip(status) {
  if (status === 'published') return '<span class="chip chip-success">Published</span>';
  if (status === 'cancelled') return '<span class="chip chip-danger">Cancelled</span>';
  return '<span class="chip chip-muted">Draft</span>';
}

function renderTable() {
  updateStats();

  if (events.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state stack-sm">
        <h2 style="margin:0;">No events yet</h2>
        <p class="muted" style="margin:0;">Create your first event to start accepting registrations.</p>
        <div><a href="/admin/event" class="btn btn-primary">Create your first event</a></div>
      </div>
    `;
    return;
  }

  const list = getFilteredEvents();
  if (list.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state stack-sm">
        <p class="muted" style="margin:0;">No events match these filters.</p>
        <div><button type="button" class="btn btn-secondary" id="clear-filters-btn">Clear filters</button></div>
      </div>
    `;
    document.getElementById('clear-filters-btn')?.addEventListener('click', () => {
      activeFilter = 'all';
      searchQuery = '';
      searchInput.value = '';
      filterButtons.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.filter === 'all')));
      syncUrl();
      renderTable();
    });
    return;
  }

  const now = new Date();
  const rowsHtml = list
    .map((ev) => {
      const phase = getEventPhase(ev, now);
      const badge = getPhaseBadge(phase);
      const reg = ev.registered_count || 0;
      const cap = ev.capacity || 0;
      const pct = cap > 0 ? Math.min(100, Math.round((reg / cap) * 100)) : 0;
      const checked = ev.checked_in_count || 0;
      const checkedPct = reg > 0 ? Math.round((checked / reg) * 100) : 0;
      const thumb = ev.cover_image_url
        ? `<img src="${escapeHtml(ev.cover_image_url)}" alt="" style="width:48px;height:36px;object-fit:cover;border-radius:6px;flex-shrink:0;">`
        : `<div style="width:48px;height:36px;border-radius:6px;background:var(--accent-soft);flex-shrink:0;"></div>`;

      const toggleLabel = ev.status === 'published' ? 'Unpublish' : 'Publish';

      return `
        <tr data-event-id="${escapeHtml(ev.id)}">
          <td data-label="Event">
            <div class="row" style="flex-wrap:nowrap;">
              ${thumb}
              <div>
                <div style="font-weight:600;">${escapeHtml(ev.title)}</div>
                <div class="muted" style="font-size:0.8125rem;">${escapeHtml(ev.venue || 'Venue TBA')}</div>
              </div>
            </div>
          </td>
          <td data-label="Date">${escapeHtml(formatEventDate(ev.starts_at, ev.ends_at))}</td>
          <td data-label="Status">
            <div class="row" style="gap:6px;">
              ${statusChip(ev.status)}
              ${ev.status === 'published' ? `<span class="chip ${badge.cls}">${escapeHtml(badge.label)}</span>` : ''}
            </div>
          </td>
          <td data-label="Registered">
            <div>${escapeHtml(String(reg))} / ${escapeHtml(String(cap || '—'))}</div>
            <div class="mini-progress"><div class="mini-progress-fill" style="width:${pct}%;"></div></div>
          </td>
          <td data-label="Checked in">${escapeHtml(String(checked))} (${escapeHtml(String(checkedPct))}%)</td>
          <td data-label="Actions">
            <div class="row-actions">
              <a class="btn btn-ghost btn-sm" href="/admin/event?id=${encodeURIComponent(ev.id)}" title="Edit event" aria-label="Edit ${escapeHtml(ev.title)}">Edit</a>
              <a class="btn btn-ghost btn-sm" href="/admin/attendees?event=${encodeURIComponent(ev.id)}" title="View attendees" aria-label="Attendees for ${escapeHtml(ev.title)}">Attendees</a>
              <a class="btn btn-ghost btn-sm" href="/admin/scanner?event=${encodeURIComponent(ev.id)}" title="Open scanner" aria-label="Scan for ${escapeHtml(ev.title)}">Scan</a>
              <button type="button" class="btn btn-ghost btn-sm" data-action="menu-toggle" aria-expanded="false" aria-label="More actions">⋯</button>
              <div class="dropdown-menu" role="menu" hidden>
                ${ev.status !== 'cancelled' ? `<button type="button" class="dropdown-item" data-action="toggle-publish" data-id="${escapeHtml(ev.id)}">${toggleLabel}</button>` : ''}
                ${ev.status !== 'cancelled' ? `<button type="button" class="dropdown-item" data-action="cancel" data-id="${escapeHtml(ev.id)}">Cancel event</button>` : ''}
                <button type="button" class="dropdown-item" data-action="duplicate" data-id="${escapeHtml(ev.id)}">Duplicate</button>
                <button type="button" class="dropdown-item" style="color:var(--danger);" data-action="delete" data-id="${escapeHtml(ev.id)}">Delete</button>
              </div>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  wrap.innerHTML = `
    <div class="table-wrap table-wrap--cards">
      <table class="data-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Date</th>
            <th>Status</th>
            <th>Registered</th>
            <th>Checked in</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  wireRowActions();
}

function wireRowActions() {
  wrap.querySelectorAll('[data-action="menu-toggle"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = btn.nextElementSibling;
      const isOpen = !menu.hidden;
      wrap.querySelectorAll('.dropdown-menu').forEach((m) => { m.hidden = true; });
      menu.hidden = isOpen;
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  });

  wrap.querySelectorAll('[data-action="toggle-publish"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ev = events.find((item) => item.id === btn.dataset.id);
      if (!ev) return;
      const nextStatus = ev.status === 'published' ? 'draft' : 'published';
      if (nextStatus === 'draft' && (ev.registered_count || 0) > 0) {
        const ok = await confirmDialog({
          title: 'Unpublish event?',
          message: `${ev.registered_count} people are already registered. Unpublishing hides this event from the public.`,
          confirmText: 'Unpublish',
        });
        if (!ok) return;
      }

      const prev = ev.status;
      ev.status = nextStatus;
      renderTable();
      try {
        const supabase = getSupabase();
        const { error } = await supabase.from('events').update({ status: nextStatus }).eq('id', ev.id);
        if (error) throw error;
        toast(nextStatus === 'published' ? 'Event published.' : 'Event moved to draft.', { type: 'success' });
      } catch (err) {
        ev.status = prev;
        renderTable();
        toast(err.message || 'Could not update event status.', { type: 'danger' });
      }
    });
  });

  wrap.querySelectorAll('[data-action="cancel"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ev = events.find((item) => item.id === btn.dataset.id);
      if (!ev) return;
      const ok = await confirmDialog({
        title: 'Cancel event?',
        message: 'Existing attendees’ tickets stay on record, and registration will close immediately.',
        confirmText: 'Cancel event',
        danger: true,
      });
      if (!ok) return;

      const prev = ev.status;
      ev.status = 'cancelled';
      renderTable();
      try {
        const supabase = getSupabase();
        const { error } = await supabase.from('events').update({ status: 'cancelled' }).eq('id', ev.id);
        if (error) throw error;
        toast('Event cancelled.', { type: 'warning' });
      } catch (err) {
        ev.status = prev;
        renderTable();
        toast(err.message || 'Could not cancel event.', { type: 'danger' });
      }
    });
  });

  wrap.querySelectorAll('[data-action="duplicate"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ev = events.find((item) => item.id === btn.dataset.id);
      if (!ev) return;
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('events')
          .insert({
            title: `${ev.title} (copy)`.slice(0, 100),
            description: ev.description,
            venue: ev.venue,
            starts_at: ev.starts_at,
            ends_at: ev.ends_at,
            capacity: ev.capacity,
            cover_image_url: ev.cover_image_url,
            status: 'draft',
          })
          .select('id')
          .single();
        if (error) throw error;
        window.location.assign(`/admin/event?id=${encodeURIComponent(data.id)}`);
      } catch (err) {
        toast(err.message || 'Could not duplicate event.', { type: 'danger' });
      }
    });
  });

  wrap.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ev = events.find((item) => item.id === btn.dataset.id);
      if (!ev) return;
      if ((ev.registered_count || 0) > 0) {
        toast('This event has registrations. Cancel it instead.', { type: 'warning' });
        return;
      }

      const ok = await confirmDialog({
        title: 'Delete event?',
        message: `This will permanently delete "${ev.title}".`,
        confirmText: 'Delete',
        danger: true,
        requireText: ev.title,
      });
      if (!ok) return;

      const idx = events.indexOf(ev);
      events.splice(idx, 1);
      renderTable();
      try {
        const supabase = getSupabase();
        const { error } = await supabase.from('events').delete().eq('id', ev.id);
        if (error) throw error;
        toast('Event deleted.', { type: 'success' });
      } catch (err) {
        events.splice(idx, 0, ev);
        renderTable();
        toast(err.message || 'Could not delete event.', { type: 'danger' });
      }
    });
  });
}

document.addEventListener('click', () => {
  wrap.querySelectorAll('.dropdown-menu').forEach((m) => { m.hidden = true; });
});

async function loadDashboard(showSkeleton = true) {
  if (showSkeleton) wrap.innerHTML = renderSkeleton('row', 4);
  try {
    const supabase = getSupabase();
    const [eventsRes, statsRes, todayRes] = await Promise.all([
      supabase.from('events').select('*').order('starts_at', { ascending: false }),
      supabase.rpc('admin_event_stats'),
      supabase.rpc('admin_checked_in_today'),
    ]);

    if (eventsRes.error) throw eventsRes.error;
    if (statsRes.error) throw statsRes.error;
    if (todayRes.error) throw todayRes.error;

    const statsMap = new Map((statsRes.data || []).map((s) => [s.event_id, s]));
    events = (eventsRes.data || []).map((ev) => {
      const st = statsMap.get(ev.id) || { registered_count: 0, checked_in_count: 0 };
      return {
        ...ev,
        registered_count: st.registered_count,
        checked_in_count: st.checked_in_count,
      };
    });
    checkedInToday = todayRes.data || 0;
    renderTable();
  } catch (err) {
    console.error('Dashboard load error:', err);
    if (events.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state stack-sm">
          <h2>Couldn’t load events</h2>
          <div><button type="button" class="btn btn-primary" id="retry-dash-btn">Retry</button></div>
        </div>
      `;
      document.getElementById('retry-dash-btn')?.addEventListener('click', () => loadDashboard(true));
    }
  }
}

filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    filterButtons.forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    syncUrl();
    renderTable();
  });
});

searchInput.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    searchQuery = searchInput.value;
    syncUrl();
    renderTable();
  }, 200);
});

sortSelect.addEventListener('change', () => {
  sortBy = sortSelect.value;
  syncUrl();
  renderTable();
});

document.getElementById('refresh-btn')?.addEventListener('click', () => loadDashboard(false));

async function init() {
  const auth = await initAdminPage({ active: 'events' });
  if (!auth) return;
  loadDashboard(true);
  window.setInterval(() => {
    if (document.visibilityState === 'visible') loadDashboard(false);
  }, 30_000);
}

init();
