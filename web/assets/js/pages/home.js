import { renderPublicNav } from '../nav.js';
import { getSupabase } from '../supabase-client.js';
import { getEventPhase, renderEventCard } from '../events.js';
import { renderSkeleton } from '../ui.js';

const eventsRoot = document.getElementById('home-events');

function renderEvents(events) {
  const now = new Date();
  const upcoming = (events || [])
    .filter((event) => event.status === 'published' && ['upcoming', 'live'].includes(getEventPhase(event, now)))
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    .slice(0, 3);

  if (upcoming.length === 0) {
    eventsRoot.innerHTML = `
      <div class="empty-state stack-sm">
        <p class="muted" style="margin:0;">No upcoming events yet.</p>
        <div><a class="btn btn-secondary" href="/explore">Browse all events</a></div>
      </div>
    `;
    return;
  }

  eventsRoot.innerHTML = `<div class="events-grid">${upcoming.map((event) => renderEventCard(event, { now })).join('')}</div>`;
}

async function loadEvents() {
  eventsRoot.innerHTML = `<div class="events-grid">${renderSkeleton('card', 3)}</div>`;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('events_public')
      .select('id, title, description, venue, starts_at, ends_at, capacity, cover_image_url, status, registered_count');

    if (error) throw error;
    renderEvents(data);
  } catch {
    eventsRoot.innerHTML = `
      <div class="empty-state stack-sm">
        <h3>Couldn’t load events</h3>
        <p class="muted" style="margin:0;">Please check your connection and try again.</p>
        <div><button type="button" class="btn btn-primary" id="retry-home-events">Retry</button></div>
      </div>
    `;
    document.getElementById('retry-home-events')?.addEventListener('click', loadEvents);
  }
}

const legacyExploreHash = /^#(?:events|live|upcoming|past)$/.test(window.location.hash);
if (legacyExploreHash) {
  window.location.replace(`/explore${window.location.hash === '#events' ? '' : window.location.hash}`);
} else {
  renderPublicNav({ active: 'home' });
  loadEvents();
}
