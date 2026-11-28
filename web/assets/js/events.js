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

export const eventIcons = {
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3.5v3M16 3.5v3M3.5 9.5h17M8 13h3m2 0h3M8 16.5h3"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.2"/></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H7.4A3.4 3.4 0 0 0 4 18.4V20m13-5a3.2 3.2 0 0 1 3 3.2V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm6-6.5a3.5 3.5 0 0 1 0 6.8"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
};

export function renderEventCard(event, { now = new Date(), preview = false } = {}) {
  const phase = getEventPhase(event, now);
  const badge = getPhaseBadge(phase);
  const left = spotsLeft(event);
  const capacity = Number(event.capacity || 0);
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
  const shortDate = event.starts_at
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(event.starts_at))
    : 'Date to be announced';
  const coverHtml = event.cover_image_url
    ? `<img src="${escapeHtml(event.cover_image_url)}" alt="" loading="lazy">`
    : '';

  const href = preview ? '#' : `/event?id=${encodeURIComponent(event.id)}`;

  return `
    <a href="${href}" class="event-card"${phase === 'past' ? ' data-event-past="true"' : ''}${preview ? ' onclick="return false;"' : ''}>
      <div class="event-cover">
        ${coverHtml}
        <span class="event-date-badge"><span>${escapeHtml(month)}</span><strong>${escapeHtml(day)}</strong></span>
      </div>
      <div class="event-card-body">
        <p class="event-date"><span class="event-card-icon">${eventIcons.calendar}</span>${escapeHtml(shortDate)}</p>
        <div class="event-card-title-row">
          <h3>${escapeHtml(event.title || 'Untitled event')}</h3>
          <span class="chip ${badge.cls}">${escapeHtml(badge.label)}</span>
        </div>
        <p class="event-venue"><span class="event-card-icon">${eventIcons.pin}</span>${escapeHtml(event.venue || 'Venue TBA')}</p>
        <div class="event-card-footer">
          <span class="event-availability"><span class="event-card-icon">${eventIcons.people}</span>${escapeHtml(availabilityText)}</span>
          <span class="event-card-link">${isOpen ? 'View event' : 'View details'} ${eventIcons.arrow}</span>
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
