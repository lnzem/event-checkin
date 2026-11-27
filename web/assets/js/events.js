import { TIMEZONE } from './config.js';
import { escapeHtml } from './ui.js';

export function getEventPhase(event, now = new Date()) {
  if (!event) return 'past';
  if (event.status === 'cancelled') return 'cancelled';

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const startMs = event.starts_at ? new Date(event.starts_at).getTime() : NaN;
  const endMs = event.ends_at ? new Date(event.ends_at).getTime() : NaN;

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return 'upcoming';
  }
  if (nowMs < startMs) return 'upcoming';
  if (nowMs <= endMs) return 'live';
  return 'past';
}

export function spotsLeft(event) {
  if (!event || typeof event.capacity !== 'number') return 0;
  const registered = typeof event.registered_count === 'number' ? event.registered_count : 0;
  return Math.max(0, event.capacity - registered);
}

export function isRegistrationOpen(event, now = new Date()) {
  if (!event || event.status !== 'published') return false;
  const phase = getEventPhase(event, now);
  if (phase !== 'upcoming' && phase !== 'live') return false;
  return spotsLeft(event) > 0;
}

export function formatEventDate(startsAt, endsAt) {
  if (!startsAt) return 'Date TBA';
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return 'Date TBA';

  const dateFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const startDate = dateFmt.format(start);
  const startTime = timeFmt.format(start);

  if (!endsAt) return `${startDate} · ${startTime}`;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return `${startDate} · ${startTime}`;

  const endDate = dateFmt.format(end);
  const endTime = timeFmt.format(end);

  if (startDate === endDate) {
    return `${startDate} · ${startTime} – ${endTime}`;
  }
  return `${startDate}, ${startTime} – ${endDate}, ${endTime}`;
}

export function getMonthDayManila(isoString) {
  if (!isoString) return { month: 'TBA', day: '--' };
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return { month: 'TBA', day: '--' };
  const month = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, month: 'short' }).format(date).toUpperCase();
  const day = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, day: 'numeric' }).format(date);
  return { month, day };
}

export function getPhaseBadge(phase) {
  switch (phase) {
    case 'live':
      return { label: 'Happening now', cls: 'chip-success' };
    case 'upcoming':
      return { label: 'Upcoming', cls: 'chip-accent' };
    case 'cancelled':
      return { label: 'Cancelled', cls: 'chip-danger' };
    default:
      return { label: 'Past', cls: 'chip-muted' };
  }
}

export function renderEventCard(event, { now = new Date(), preview = false } = {}) {
  const phase = getEventPhase(event, now);
  const badge = getPhaseBadge(phase);
  const left = spotsLeft(event);
  const capacity = Number(event.capacity || 0);
  const isPastOrCancelled = phase === 'past' || phase === 'cancelled';
  const isOpen = isRegistrationOpen(event, now);

  let availabilityText = '';
  if (phase === 'cancelled') {
    availabilityText = 'Event cancelled';
  } else if (phase === 'past') {
    availabilityText = 'Event ended';
  } else if (left <= 0) {
    availabilityText = 'Full';
  } else if (capacity > 0 && left <= Math.ceil(capacity * 0.1)) {
    availabilityText = `Almost full · ${left} ${left === 1 ? 'spot' : 'spots'} left`;
  } else {
    availabilityText = `${left} ${left === 1 ? 'spot' : 'spots'} left`;
  }

  const { month, day } = getMonthDayManila(event.starts_at);
  const coverHtml = event.cover_image_url
    ? `<img src="${escapeHtml(event.cover_image_url)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;">`
    : `<div style="width:100%;height:100%;background:linear-gradient(135deg,var(--accent-soft),var(--surface-subtle));"></div>`;

  let ctaHtml = '';
  if (isOpen) {
    ctaHtml = `<span class="btn btn-primary btn-sm" style="width:100%;">Register</span>`;
  } else if (!isPastOrCancelled && left <= 0) {
    ctaHtml = `<span class="btn btn-secondary btn-sm" aria-disabled="true" style="width:100%;">Full</span>`;
  } else {
    ctaHtml = `<span class="btn btn-secondary btn-sm" style="width:100%;">View details</span>`;
  }

  const href = preview ? '#' : `/event?id=${encodeURIComponent(event.id)}`;
  const mutedStyle = phase === 'past' ? 'opacity:0.78;' : '';

  return `
    <a href="${href}" class="card stack-sm" style="padding:0;overflow:hidden;color:inherit;text-decoration:none;display:flex;flex-direction:column;${mutedStyle}"${preview ? ' onclick="return false;"' : ''}>
      <div style="position:relative;aspect-ratio:16/9;overflow:hidden;background:var(--surface-subtle);">
        ${coverHtml}
        <div style="position:absolute;top:12px;left:12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:4px 10px;text-align:center;line-height:1.1;box-shadow:var(--shadow);">
          <div style="font-size:0.6875rem;font-weight:700;color:var(--accent);">${escapeHtml(month)}</div>
          <div style="font-size:1rem;font-weight:700;color:var(--text);">${escapeHtml(day)}</div>
        </div>
      </div>
      <div class="stack-sm" style="padding:16px;flex:1;justify-content:space-between;">
        <div class="stack-sm">
          <div class="row-between">
            <span class="chip ${badge.cls}">${escapeHtml(badge.label)}</span>
            <span class="muted" style="font-size:0.8125rem;font-weight:500;">${escapeHtml(availabilityText)}</span>
          </div>
          <h3 style="margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(event.title || 'Untitled event')}</h3>
          <p class="muted" style="margin:0;font-size:0.875rem;">
            <span aria-hidden="true">📍</span> ${escapeHtml(event.venue || 'Venue TBA')}
          </p>
          <p class="muted" style="margin:0;font-size:0.875rem;">
            ${escapeHtml(formatEventDate(event.starts_at, event.ends_at))}
          </p>
        </div>
        <div style="padding-top:8px;">
          ${ctaHtml}
        </div>
      </div>
    </a>
  `;
}

function toIcsUtc(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function downloadIcs(event) {
  if (!event?.starts_at) return;
  const start = toIcsUtc(event.starts_at);
  const end = event.ends_at ? toIcsUtc(event.ends_at) : toIcsUtc(new Date(new Date(event.starts_at).getTime() + 3600_000).toISOString());
  const uid = `${event.id || Date.now()}@event-checkin`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Event Check-In//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `LOCATION:${escapeIcsText(event.venue || '')}`,
    `DESCRIPTION:${escapeIcsText(event.description || '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${String(event.title || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
