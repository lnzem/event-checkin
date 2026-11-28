import { renderPublicNav } from '../nav.js';
import { getSupabase } from '../supabase-client.js';
import { getSession } from '../auth.js';
import {
  downloadIcs,
  formatEventDate,
  getEventPhase,
  getPhaseBadge,
  isRegistrationOpen,
  spotsLeft,
} from '../events.js';
import { escapeHtml, toast } from '../ui.js';

const root = document.getElementById('event-root');
const params = new URLSearchParams(window.location.search);
const eventId = params.get('id')?.trim() || '';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let currentEvent = null;
let alreadyRegistered = false;

function renderLoading() {
  root.innerHTML = `
    <div class="stack-lg">
      <div class="skeleton" style="width:100%;aspect-ratio:16/9;border-radius:12px;"></div>
      <div class="event-layout">
        <div class="stack">
          <div class="skeleton" style="height:36px;width:70%;"></div>
          <div class="skeleton" style="height:140px;width:100%;"></div>
        </div>
        <div class="card stack">
          <div class="skeleton" style="height:24px;width:60%;"></div>
          <div class="skeleton" style="height:44px;width:100%;"></div>
        </div>
      </div>
    </div>
  `;
}

function renderNotFound() {
  root.innerHTML = `
    <div class="empty-state stack-sm">
      <h1>We couldn’t find that event</h1>
      <p class="muted" style="margin:0;">It may have been removed or is not yet published.</p>
      <div><a href="/" class="btn btn-primary">Browse events</a></div>
    </div>
  `;
}

function updateMeta(ev) {
  document.title = `${ev.title} — Live`;
  const desc = (ev.description || '').slice(0, 155);
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogTitle) ogTitle.setAttribute('content', ev.title);
  if (ogDesc) ogDesc.setAttribute('content', desc);
  if (ev.cover_image_url) {
    let ogImg = document.querySelector('meta[property="og:image"]');
    if (!ogImg) {
      ogImg = document.createElement('meta');
      ogImg.setAttribute('property', 'og:image');
      document.head.appendChild(ogImg);
    }
    ogImg.setAttribute('content', ev.cover_image_url);
  }
}

function renderEvent() {
  const ev = currentEvent;
  const now = new Date();
  const phase = getEventPhase(ev, now);
  const badge = getPhaseBadge(phase);
  const left = spotsLeft(ev);
  const capacity = Number(ev.capacity || 0);
  const taken = Math.min(capacity, Number(ev.registered_count || 0));
  const pct = capacity > 0 ? Math.min(100, Math.round((taken / capacity) * 100)) : 0;
  const open = isRegistrationOpen(ev, now);

  let ctaBlock = '';
  if (phase === 'cancelled') {
    ctaBlock = `<div class="banner banner-danger" role="status">This event was cancelled</div>`;
  } else if (alreadyRegistered) {
    ctaBlock = `<a href="/tickets" class="btn btn-primary" style="width:100%;">You’re registered — View ticket</a>`;
  } else if (open) {
    ctaBlock = `<a href="/register?event=${encodeURIComponent(ev.id)}" class="btn btn-primary" style="width:100%;">Register</a>`;
  } else if (phase === 'past') {
    ctaBlock = `<button type="button" class="btn btn-secondary" disabled style="width:100%;">This event has ended</button>`;
  } else {
    ctaBlock = `<button type="button" class="btn btn-secondary" disabled style="width:100%;">Event full</button>`;
  }

  const coverHtml = ev.cover_image_url
    ? `<img src="${escapeHtml(ev.cover_image_url)}" alt="${escapeHtml(ev.title)}" style="width:100%;height:100%;object-fit:cover;">`
    : '';

  const formattedDate = formatEventDate(ev.starts_at, ev.ends_at);
  const descriptionHtml = escapeHtml(ev.description || 'No description provided.').replace(/\r?\n/g, '<br>');

  root.innerHTML = `
    <div class="stack-lg">
      <div class="cover-banner">${coverHtml}</div>

      <div class="event-layout">
        <div class="stack-lg">
          <div class="stack-sm">
            <div><span class="chip ${badge.cls}">${escapeHtml(badge.label)}</span></div>
            <h1 style="margin:0;">${escapeHtml(ev.title)}</h1>
          </div>

          <section class="card stack-sm">
            <h2 style="font-size:1.25rem;margin:0;">About this event</h2>
            <p style="margin:0;line-height:1.65;">${descriptionHtml}</p>
          </section>

          <section class="card stack">
            <h2 style="font-size:1.25rem;margin:0;">Details</h2>
            <div class="stack-sm">
              <div><strong>Date &amp; Time:</strong> <span class="muted">${escapeHtml(formattedDate)} (Asia/Manila)</span></div>
              <div><strong>Venue:</strong> <span class="muted">${escapeHtml(ev.venue || 'TBA')}</span></div>
              <div><strong>Capacity:</strong> <span class="muted">${escapeHtml(String(capacity))} spots (${escapeHtml(String(left))} left)</span></div>
            </div>
            <div class="row">
              <button type="button" class="btn btn-secondary btn-sm" id="add-calendar-btn">Add to calendar</button>
              <button type="button" class="btn btn-secondary btn-sm" id="copy-link-btn">Copy link</button>
            </div>
          </section>
        </div>

        <aside class="card stack event-sidebar">
          <div class="stack-sm">
            <div style="font-weight:600;">${escapeHtml(formattedDate)}</div>
            <div class="muted" style="font-size:0.9375rem;">📍 ${escapeHtml(ev.venue || 'Venue TBA')}</div>
          </div>

          <div class="stack-sm">
            <div class="row-between" style="font-size:0.875rem;">
              <span>${escapeHtml(String(taken))} of ${escapeHtml(String(capacity))} spots taken</span>
              <span class="muted">${escapeHtml(String(left))} left</span>
            </div>
            <div class="progress-track" aria-hidden="true">
              <div class="progress-fill" style="width:${pct}%;"></div>
            </div>
          </div>

          ${ctaBlock}

          <div class="row">
            <button type="button" class="btn btn-ghost btn-sm" id="sidebar-calendar-btn" style="flex:1;">Add to calendar</button>
            <button type="button" class="btn btn-ghost btn-sm" id="sidebar-copy-btn" style="flex:1;">Copy link</button>
          </div>
        </aside>
      </div>
    </div>
  `;

  const onCalendar = () => downloadIcs(ev);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast('Event link copied!', { type: 'success' });
    } catch {
      toast('Could not copy link.', { type: 'danger' });
    }
  };

  document.getElementById('add-calendar-btn')?.addEventListener('click', onCalendar);
  document.getElementById('sidebar-calendar-btn')?.addEventListener('click', onCalendar);
  document.getElementById('copy-link-btn')?.addEventListener('click', onCopy);
  document.getElementById('sidebar-copy-btn')?.addEventListener('click', onCopy);
}

async function loadEvent(showSkeleton = true) {
  if (!UUID_RE.test(eventId)) {
    renderNotFound();
    return;
  }
  if (showSkeleton) renderLoading();

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('events_public')
      .select('id, title, description, venue, starts_at, ends_at, capacity, cover_image_url, status, registered_count')
      .eq('id', eventId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      renderNotFound();
      return;
    }

    currentEvent = data;
    updateMeta(data);

    try {
      const session = await getSession();
      if (session?.user) {
        const { data: reg } = await supabase
          .from('registrations')
          .select('id')
          .eq('event_id', eventId)
          .eq('user_id', session.user.id)
          .maybeSingle();
        alreadyRegistered = Boolean(reg);
      }
    } catch {
      alreadyRegistered = false;
    }

    renderEvent();
  } catch (err) {
    console.error('Error loading event:', err);
    if (!currentEvent) {
      root.innerHTML = `
        <div class="empty-state stack-sm">
          <h2>Couldn’t load event</h2>
          <p class="muted" style="margin:0;">Please check your connection and try again.</p>
          <div><button type="button" class="btn btn-primary" id="retry-event-btn">Retry</button></div>
        </div>
      `;
      document.getElementById('retry-event-btn')?.addEventListener('click', () => loadEvent(true));
    }
  }
}

renderPublicNav();
loadEvent(true);
window.setInterval(() => {
  if (currentEvent && document.visibilityState === 'visible') {
    loadEvent(false);
  }
}, 60_000);
