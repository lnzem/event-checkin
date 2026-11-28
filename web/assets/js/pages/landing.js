import { renderPublicNav } from '../nav.js';
import { getSupabase } from '../supabase-client.js';
import { apiFetch } from '../api.js';
import { getEventPhase, renderEventCard } from '../events.js';
import { escapeHtml, openModal, renderSkeleton } from '../ui.js';

const PAST_PAGE_SIZE = 12;

let allEvents = [];
let activeTab = null;
let searchQuery = '';
let pastLimit = PAST_PAGE_SIZE;
let searchTimer = null;

const panel = document.getElementById('events-panel');
const searchInput = document.getElementById('event-search');
const tabButtons = Array.from(document.querySelectorAll('#event-tabs [role="tab"]'));

function bucketEvents(events, now = new Date()) {
  const buckets = { live: [], upcoming: [], past: [] };
  for (const ev of events) {
    const phase = getEventPhase(ev, now);
    if (phase === 'live') {
      buckets.live.push(ev);
    } else if (phase === 'upcoming') {
      buckets.upcoming.push(ev);
    } else if (phase === 'cancelled') {
      const endMs = ev.ends_at ? new Date(ev.ends_at).getTime() : 0;
      if (endMs >= now.getTime()) buckets.upcoming.push(ev);
      else buckets.past.push(ev);
    } else {
      buckets.past.push(ev);
    }
  }

  buckets.live.sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at));
  buckets.upcoming.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  buckets.past.sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
  return buckets;
}

function getTabFromHash() {
  const h = window.location.hash.replace('#', '');
  if (h === 'live' || h === 'upcoming' || h === 'past') return h;
  return null;
}

function setActiveTab(tab, updateHash = true) {
  activeTab = tab;
  for (const btn of tabButtons) {
    const selected = btn.dataset.tab === tab;
    btn.setAttribute('aria-selected', String(selected));
  }
  if (updateHash) {
    history.replaceState(null, '', `#${tab}`);
  }
  renderPanel();
}

function renderPanel() {
  const now = new Date();
  const buckets = bucketEvents(allEvents, now);

  document.getElementById('count-live').textContent = String(buckets.live.length);
  document.getElementById('count-upcoming').textContent = String(buckets.upcoming.length);
  document.getElementById('count-past').textContent = String(buckets.past.length);

  if (!activeTab) {
    activeTab = getTabFromHash() || (buckets.live.length > 0 ? 'live' : 'upcoming');
    for (const btn of tabButtons) {
      btn.setAttribute('aria-selected', String(btn.dataset.tab === activeTab));
    }
  }

  const list = buckets[activeTab] || [];
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? list.filter(
        (ev) =>
          (ev.title || '').toLowerCase().includes(q) ||
          (ev.venue || '').toLowerCase().includes(q)
      )
    : list;

  if (filtered.length === 0) {
    if (q) {
      panel.innerHTML = `
        <div class="empty-state stack-sm">
          <h3>No events match '${escapeHtml(searchQuery.trim())}'</h3>
          <p class="muted" style="margin:0;">Try a different keyword or clear your search.</p>
          <div><button type="button" class="btn btn-secondary" id="clear-search-btn">Clear search</button></div>
        </div>
      `;
      document.getElementById('clear-search-btn')?.addEventListener('click', () => {
        searchQuery = '';
        searchInput.value = '';
        renderPanel();
      });
      return;
    }

    const emptyCopy = {
      live: {
        text: 'No events happening right now. Check upcoming events.',
        btn: 'View upcoming events',
        target: 'upcoming',
      },
      upcoming: {
        text: 'No upcoming events scheduled yet. Check past events.',
        btn: 'View past events',
        target: 'past',
      },
      past: {
        text: 'No past events yet.',
        btn: 'View upcoming events',
        target: 'upcoming',
      },
    }[activeTab];

    panel.innerHTML = `
      <div class="empty-state stack-sm">
        <p class="muted" style="margin:0;">${escapeHtml(emptyCopy.text)}</p>
        <div><button type="button" class="btn btn-secondary" id="switch-tab-btn">${escapeHtml(emptyCopy.btn)}</button></div>
      </div>
    `;
    document.getElementById('switch-tab-btn')?.addEventListener('click', () => {
      setActiveTab(emptyCopy.target);
    });
    return;
  }

  const visible = activeTab === 'past' ? filtered.slice(0, pastLimit) : filtered;
  const cardsHtml = visible.map((ev) => renderEventCard(ev, { now })).join('');
  const loadMoreHtml =
    activeTab === 'past' && filtered.length > visible.length
      ? `<div style="text-align:center;padding-top:8px;"><button type="button" class="btn btn-secondary" id="load-more-past">Load more</button></div>`
      : '';

  panel.innerHTML = `<div class="events-grid">${cardsHtml}</div>${loadMoreHtml}`;
  document.getElementById('load-more-past')?.addEventListener('click', () => {
    pastLimit += PAST_PAGE_SIZE;
    renderPanel();
  });
}

async function loadEvents() {
  panel.innerHTML = `<div class="events-grid">${renderSkeleton('card', 6)}</div>`;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('events_public')
      .select('id, title, description, venue, starts_at, ends_at, capacity, cover_image_url, status, registered_count');

    if (error) throw error;
    allEvents = data || [];
    renderPanel();
  } catch (err) {
    console.error('Failed to load events:', err);
    panel.innerHTML = `
      <div class="empty-state stack-sm">
        <h3>Couldn’t load events</h3>
        <p class="muted" style="margin:0;">Please check your connection and try again.</p>
        <div><button type="button" class="btn btn-primary" id="retry-events-btn">Retry</button></div>
      </div>
    `;
    document.getElementById('retry-events-btn')?.addEventListener('click', loadEvents);
  }
}

function openFindTicketModal() {
  const form = document.createElement('form');
  form.className = 'stack';
  form.noValidate = true;
  form.innerHTML = `
    <p class="muted" style="margin:0;">Enter the email you used to register and we’ll resend your active tickets.</p>
    <div class="field">
      <label class="field-label" for="resend-email-input">Email address</label>
      <input id="resend-email-input" class="input" type="email" required placeholder="you@example.com">
      <span id="resend-email-err" class="field-error" hidden></span>
    </div>
    <div id="resend-status" aria-live="polite"></div>
    <button type="submit" class="btn btn-primary" id="resend-submit-btn">Send my tickets</button>
  `;

  openModal({ title: 'Find my ticket', content: form });

  const emailInput = form.querySelector('#resend-email-input');
  const errEl = form.querySelector('#resend-email-err');
  const statusEl = form.querySelector('#resend-status');
  const submitBtn = form.querySelector('#resend-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailInput.setAttribute('aria-invalid', 'true');
      errEl.textContent = 'Enter a valid email address.';
      errEl.hidden = false;
      emailInput.focus();
      return;
    }

    emailInput.removeAttribute('aria-invalid');
    errEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Sending…';

    try {
      await apiFetch('/api/resend-ticket', {
        method: 'POST',
        auth: false,
        body: { email },
      });
      statusEl.innerHTML = `<div class="banner banner-success">If that email has tickets, we’ve sent them.</div>`;
    } catch (err) {
      statusEl.innerHTML = `<div class="banner banner-danger">${escapeHtml(err.message || 'Please try again in a minute.')}</div>`;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send my tickets';
    }
  });
}

// Event listeners
tabButtons.forEach((btn, idx) => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = tabButtons[(idx + 1) % tabButtons.length];
      next.focus();
      setActiveTab(next.dataset.tab);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = tabButtons[(idx - 1 + tabButtons.length) % tabButtons.length];
      prev.focus();
      setActiveTab(prev.dataset.tab);
    }
  });
});

window.addEventListener('hashchange', () => {
  const fromHash = getTabFromHash();
  if (fromHash && fromHash !== activeTab) {
    setActiveTab(fromHash, false);
  }
});

searchInput.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    searchQuery = searchInput.value;
    renderPanel();
  }, 200);
});

document.getElementById('find-ticket-btn')?.addEventListener('click', openFindTicketModal);

  renderPublicNav();
loadEvents();
window.setInterval(() => {
  if (allEvents.length > 0) renderPanel();
}, 60_000);
