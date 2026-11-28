import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm';
import { renderPublicNav } from '../nav.js';
import { getSupabase } from '../supabase-client.js';
import { claimMyRegistrations, requireUser } from '../auth.js';
import { apiFetch } from '../api.js';
import { formatEventDate, getEventPhase } from '../events.js';
import { escapeHtml, openModal, renderSkeleton, toast } from '../ui.js';

const panel = document.getElementById('tickets-panel');
const subtitle = document.getElementById('tickets-subtitle');
const tabButtons = Array.from(document.querySelectorAll('[role="tab"]'));

let userEmail = '';
let activeTab = 'upcoming';
let tickets = [];
let emailCooldownUntil = 0;
let ticketClaimError = false;

function formatCheckedInTime(iso) {
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

function splitTickets() {
  const now = new Date();
  const upcoming = [];
  const past = [];

  for (const t of tickets) {
    const ev = t.events;
    if (!ev) continue;
    const phase = getEventPhase(ev, now);
    if (phase === 'past' || (phase === 'cancelled' && new Date(ev.ends_at) < now)) {
      past.push({ ...t, phase });
    } else {
      upcoming.push({ ...t, phase });
    }
  }

  upcoming.sort((a, b) => new Date(a.events.starts_at) - new Date(b.events.starts_at));
  past.sort((a, b) => new Date(b.events.starts_at) - new Date(a.events.starts_at));
  return { upcoming, past };
}

async function openQrModal(ticket) {
  const container = document.createElement('div');
  container.className = 'stack';
  container.style.textAlign = 'center';

  const qrUrl = await QRCode.toDataURL(ticket.ticket_id, {
    errorCorrectionLevel: 'M',
    width: 360,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  container.innerHTML = `
    <div class="qr-modal-box">
      <img src="${qrUrl}" alt="QR code for ${escapeHtml(ticket.ticket_id)}">
    </div>
    <div class="mono" style="font-size:1.5rem;font-weight:700;letter-spacing:0.08em;">${escapeHtml(ticket.ticket_id)}</div>
    <div class="stack-sm" style="gap:2px;">
      <div style="font-weight:600;">${escapeHtml(ticket.full_name)}</div>
      <div class="muted">${escapeHtml(ticket.events.title)}</div>
      <div class="muted" style="font-size:0.875rem;">${escapeHtml(formatEventDate(ticket.events.starts_at, ticket.events.ends_at))}</div>
    </div>
    <p class="muted" style="margin:0;font-size:0.8125rem;">Turn your screen brightness up before scanning.</p>
  `;

  let wakeLock = null;
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch {
      wakeLock = null;
    }
  }

  openModal({
    title: 'Your QR Ticket',
    content: container,
    onClose: () => {
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    },
  });
}

async function downloadTicketPng(ticket) {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, ticket.ticket_id, {
    errorCorrectionLevel: 'M',
    width: 480,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 30px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(ticket.events.title || '').slice(0, 38), 360, 72);

  ctx.fillStyle = '#475569';
  ctx.font = '20px Inter, system-ui, sans-serif';
  ctx.fillText(formatEventDate(ticket.events.starts_at, ticket.events.ends_at), 360, 112);

  ctx.drawImage(qrCanvas, 120, 150, 480, 480);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 40px monospace';
  ctx.fillText(ticket.ticket_id, 360, 690);

  ctx.font = '600 26px Inter, system-ui, sans-serif';
  ctx.fillText(ticket.full_name, 360, 750);

  ctx.fillStyle = '#64748b';
  ctx.font = '18px Inter, system-ui, sans-serif';
  ctx.fillText('Show this QR at the entrance.', 360, 810);

  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `ticket-${ticket.ticket_id}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function renderTickets() {
  const { upcoming, past } = splitTickets();
  document.getElementById('count-upcoming').textContent = String(upcoming.length);
  document.getElementById('count-past').textContent = String(past.length);

  const list = activeTab === 'upcoming' ? upcoming : past;
  if (list.length === 0) {
    panel.innerHTML =
      activeTab === 'upcoming'
        ? `<div class="empty-state stack-sm"><p class="muted" style="margin:0;">No upcoming tickets yet.</p><div><a href="/" class="btn btn-primary">Browse events</a></div></div>`
        : `<div class="empty-state"><p class="muted" style="margin:0;">No past events yet.</p></div>`;
    return;
  }

  panel.innerHTML = list
    .map((t) => {
      const ev = t.events;
      const isPast = activeTab === 'past';
      let statusChip = '<span class="chip chip-accent">Registered</span>';
      if (ev.status === 'cancelled') {
        statusChip = '<span class="chip chip-danger">Event cancelled</span>';
      } else if (t.checked_in) {
        statusChip = `<span class="chip chip-success">Checked in · ${escapeHtml(formatCheckedInTime(t.checked_in_at))}</span>`;
      }

      const thumbHtml = ev.cover_image_url
        ? `<img class="ticket-thumb" src="${escapeHtml(ev.cover_image_url)}" alt="">`
        : `<div class="ticket-thumb"></div>`;

      const primaryBtn = isPast
        ? `<button type="button" class="btn btn-secondary btn-sm" disabled>Event ended</button>`
        : `<button type="button" class="btn btn-primary btn-sm" data-action="show-qr" data-id="${escapeHtml(t.id)}">Show QR</button>`;

      return `
        <article class="card ticket-card" style="${isPast ? 'opacity:0.78;' : ''}">
          ${thumbHtml}
          <div class="stack-sm">
            <div class="row-between">
              <h2 style="font-size:1.125rem;margin:0;">${escapeHtml(ev.title)}</h2>
              ${statusChip}
            </div>
            <div class="muted" style="font-size:0.875rem;">${escapeHtml(formatEventDate(ev.starts_at, ev.ends_at))}</div>
            <div class="muted" style="font-size:0.875rem;">${escapeHtml(ev.venue || 'Venue TBA')}</div>
            <div class="row" style="gap:8px;">
              <span class="mono" style="font-weight:700;">${escapeHtml(t.ticket_id)}</span>
              <button type="button" class="btn btn-ghost btn-sm" data-action="copy-id" data-ticket="${escapeHtml(t.ticket_id)}">Copy</button>
            </div>
            <div class="row" style="padding-top:4px;">
              ${primaryBtn}
              <button type="button" class="btn btn-secondary btn-sm" data-action="download" data-id="${escapeHtml(t.id)}">Download</button>
              <button type="button" class="btn btn-ghost btn-sm" data-action="email" data-id="${escapeHtml(t.id)}">Email me this ticket</button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  panel.querySelectorAll('[data-action="show-qr"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = tickets.find((item) => item.id === btn.dataset.id);
      if (t) openQrModal(t);
    });
  });

  panel.querySelectorAll('[data-action="download"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = tickets.find((item) => item.id === btn.dataset.id);
      if (t) downloadTicketPng(t);
    });
  });

  panel.querySelectorAll('[data-action="copy-id"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.ticket);
        toast('Ticket ID copied!', { type: 'success' });
      } catch {
        toast('Could not copy Ticket ID.', { type: 'danger' });
      }
    });
  });

  panel.querySelectorAll('[data-action="email"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (Date.now() < emailCooldownUntil) {
        toast('Please wait a minute before resending.', { type: 'warning' });
        return;
      }
      btn.disabled = true;
      try {
        await apiFetch('/api/resend-ticket', {
          method: 'POST',
          auth: false,
          body: { email: userEmail },
        });
        emailCooldownUntil = Date.now() + 60_000;
        toast('Sent! Check your inbox.', { type: 'success' });
        window.setTimeout(() => {
          if (btn.isConnected) btn.disabled = false;
        }, 60_000);
      } catch (err) {
        toast(err.message || 'Could not send email.', { type: 'danger' });
        btn.disabled = false;
      }
    });
  });
}

async function loadTickets(session) {
  panel.innerHTML = renderSkeleton('row', 3);
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('registrations')
      .select('id, ticket_id, full_name, checked_in, checked_in_at, events(id, title, starts_at, ends_at, venue, cover_image_url, status)')
      .eq('user_id', session.user.id);

    if (error) throw error;
    tickets = data || [];
    if (tickets.length === 0 && ticketClaimError) {
      panel.innerHTML = `
        <div class="empty-state stack-sm">
          <h2>We couldn’t link your tickets yet</h2>
          <p class="muted" style="margin:0;">Try again to find registrations made with this email.</p>
          <div><button type="button" class="btn btn-primary" id="retry-ticket-claim-btn">Try again</button></div>
        </div>
      `;
      document.getElementById('retry-ticket-claim-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('retry-ticket-claim-btn');
        btn.disabled = true;
        btn.textContent = 'Checking…';
        try {
          await claimMyRegistrations();
          ticketClaimError = false;
          await loadTickets(session);
        } catch (err) {
          console.error('claim_my_registrations error:', err?.code || err?.message || 'unknown error');
          btn.disabled = false;
          btn.textContent = 'Try again';
          toast('Could not link tickets right now. Please try again.', { type: 'danger' });
        }
      });
    } else {
      renderTickets();
    }
  } catch (err) {
    console.error('Failed to load tickets:', err);
    panel.innerHTML = `
      <div class="empty-state stack-sm">
        <h2>Couldn’t load tickets</h2>
        <div><button type="button" class="btn btn-primary" id="retry-tickets-btn">Retry</button></div>
      </div>
    `;
    document.getElementById('retry-tickets-btn')?.addEventListener('click', () => loadTickets(session));
  }
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    tabButtons.forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    renderTickets();
  });
});

async function init() {
  renderPublicNav({ active: 'tickets' });
  const session = await requireUser();
  if (!session) return;

  userEmail = session.user.email || '';
  subtitle.textContent = userEmail;

  ticketClaimError = false;
  try {
    await claimMyRegistrations();
  } catch (err) {
    ticketClaimError = true;
    console.error('claim_my_registrations error:', err?.code || err?.message || 'unknown error');
  }

  loadTickets(session);
}

init();
