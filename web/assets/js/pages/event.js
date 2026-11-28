import { renderPublicNav } from '../nav.js';
import { getSupabase } from '../supabase-client.js';
import { getSession } from '../auth.js';
import {
  downloadIcs,
  formatEventDate,
  getEventPhase,
  getPhaseBadge,
  isRegistrationOpen,
  eventIcons,
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
  document.title = `${ev.title} — Regismeow`;
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
  document.body.classList.add('focused-flow');
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
    : `<div class="event-cover-fallback" aria-hidden="true"><span class="event-cover-mark">${eventIcons.calendar}</span><span>SEMINAR<br> SERIES</span></div>`;

  const formattedDate = formatEventDate(ev.starts_at, ev.ends_at);
  const descriptionHtml = escapeHtml(ev.description || 'No description provided.').replace(/\r?\n/g, '<br>');
  const venue = String(ev.venue || '').trim();
  const hasMapLocation = venue && !/^(venue tba|tba|to be announced|online|virtual)(\b|\s|\/|$)/i.test(venue);
  const locationHtml = hasMapLocation
    ? `
      <section class="card stack-sm">
        <div class="row-between">
          <h2 class="event-section-title"><span class="event-section-icon">${eventIcons.pin}</span>Location</h2>
          <a class="btn btn-secondary btn-sm" href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(venue)}" target="_blank" rel="noopener noreferrer">Open in Maps</a>
        </div>
        <p class="event-location-name">${escapeHtml(venue)}</p>
        <div class="event-map">
          <iframe
            src="https://www.google.com/maps?q=${encodeURIComponent(venue)}&amp;output=embed"
            title="Map showing ${escapeHtml(venue)}"
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
            allowfullscreen></iframe>
        </div>
      </section>
    `
    : '';

  root.innerHTML = `
    <div class="event-layout">
      <div class="cover-banner">
        ${coverHtml}
        <div class="event-cover-shade"></div>
        <span class="event-cover-label">EVENT DETAILS</span>
      </div>

      <aside class="card stack event-sidebar">
        <div class="event-status-row"><span class="chip ${badge.cls}">${escapeHtml(badge.label)}</span><span class="event-type-pill">EVENT INFORMATION</span></div>
        <h1>${escapeHtml(ev.title)}</h1>
        <div class="event-meta-card">
          <span class="event-detail-icon">${eventIcons.calendar}</span>
          <div><span class="event-detail-label">Date &amp; time</span><div class="event-meta-value">${escapeHtml(formattedDate)}</div><span class="event-meta-note">All times shown in Asia/Manila</span></div>
        </div>
        <div class="event-meta-card">
          <span class="event-detail-icon">${eventIcons.pin}</span>
          <div><span class="event-detail-label">Location</span><div class="event-meta-value">${escapeHtml(ev.venue || 'Venue TBA')}</div></div>
        </div>

        <div class="event-capacity stack-sm">
          <div class="row-between">
            <span class="event-capacity-label"><span class="event-detail-icon event-detail-icon-small">${eventIcons.people}</span><span>${escapeHtml(String(taken))} of ${escapeHtml(String(capacity))} spots taken</span></span>
            <span class="event-spots-left">${escapeHtml(String(left))} left</span>
          </div>
          <div class="progress-track" aria-hidden="true">
            <div class="progress-fill" style="width:${pct}%;"></div>
          </div>
        </div>

        <div class="row event-secondary-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="add-calendar-btn"><span class="button-icon">${eventIcons.calendar}</span>Add to calendar</button>
          <button type="button" class="btn btn-secondary btn-sm" id="copy-link-btn"><span class="button-icon">${eventIcons.arrow}</span>Copy link</button>
        </div>

        <div class="event-primary-action">${ctaBlock}</div>
      </aside>

      <div class="event-content stack-lg">
        <section class="event-about card stack-sm">
          <h2 class="event-section-title"><span class="event-section-icon">${eventIcons.calendar}</span>About this event</h2>
          <p>${descriptionHtml}</p>
        </section>

        <section class="event-details card stack-sm">
          <h2 class="event-section-title"><span class="event-section-icon">${eventIcons.people}</span>At a glance</h2>
          <div class="event-detail-row"><span class="event-detail-icon">${eventIcons.calendar}</span><div><strong>Date &amp; time</strong><span>${escapeHtml(formattedDate)} (Asia/Manila)</span></div></div>
          <div class="event-detail-row"><span class="event-detail-icon">${eventIcons.pin}</span><div><strong>Venue</strong><span>${escapeHtml(ev.venue || 'Venue TBA')}</span></div></div>
          <div class="event-detail-row"><span class="event-detail-icon">${eventIcons.people}</span><div><strong>Availability</strong><span>${escapeHtml(String(left))} of ${escapeHtml(String(capacity))} spots available</span></div></div>
        </section>

        ${locationHtml}
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
  document.getElementById('copy-link-btn')?.addEventListener('click', onCopy);
  document.body.classList.add('has-event-action');
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
document.body.classList.add('focused-flow');
loadEvent(true);
window.setInterval(() => {
  if (currentEvent && document.visibilityState === 'visible') {
    loadEvent(false);
  }
}, 60_000);
