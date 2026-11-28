import { initAdminPage } from '../admin-shell.js';
import { getSupabase } from '../supabase-client.js';
import { apiFetch } from '../api.js';
import { formatEventDate } from '../events.js';
import { escapeHtml, renderSkeleton } from '../ui.js';

const root = document.getElementById('scanner-root');
const pinWrap = document.getElementById('scanner-pin-wrap');

const params = new URLSearchParams(window.location.search);
let eventId = params.get('event')?.trim() || '';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let currentEvent = null;
let checkedInCount = 0;
let registeredCount = 0;
let html5Qr = null;
let cameraRunning = false;
let scanPaused = false;
let lastDecodedCode = '';
let lastDecodedAt = 0;
let wakeLock = null;
let audioCtx = null;
let muted = localStorage.getItem('scanner_muted') === '1';
let resultFadeTimer = null;
const recentScans = [];

function initAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx?.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

function playBeep(type) {
  if (muted) return;
  initAudio();
  if (!audioCtx) return;

  const beep = (freq, startOffset, dur) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime + startOffset);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + startOffset + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime + startOffset);
    osc.stop(audioCtx.currentTime + startOffset + dur);
  };

  if (type === 'success') {
    beep(880, 0, 0.14);
  } else if (type === 'warning') {
    beep(520, 0, 0.11);
    beep(520, 0.16, 0.11);
  } else {
    beep(240, 0, 0.25);
  }
}

function formatTime(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

function renderPinnedHeader() {
  pinWrap.innerHTML = `
    <div class="scanner-pin">
      <div class="container row-between">
        <div>
          <div style="font-weight:700;font-size:1.0625rem;">${escapeHtml(currentEvent.title)}</div>
          <div class="muted" style="font-size:0.8125rem;">${escapeHtml(formatEventDate(currentEvent.starts_at, currentEvent.ends_at))}</div>
        </div>
        <div class="row">
          <span class="chip chip-accent" id="scanner-counter" style="font-size:0.875rem;">${escapeHtml(String(checkedInCount))} / ${escapeHtml(String(registeredCount))} checked in</span>
          <button type="button" id="mute-btn" class="btn btn-secondary btn-sm">${muted ? 'Unmute' : 'Mute'}</button>
          <button type="button" id="change-event-btn" class="btn btn-ghost btn-sm">Change event</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('mute-btn').addEventListener('click', (e) => {
    muted = !muted;
    localStorage.setItem('scanner_muted', muted ? '1' : '0');
    e.currentTarget.textContent = muted ? 'Unmute' : 'Mute';
  });

  document.getElementById('change-event-btn').addEventListener('click', async () => {
    await stopCamera();
    eventId = '';
    currentEvent = null;
    pinWrap.innerHTML = '';
    history.replaceState(null, '', '/admin/scanner');
    renderEventPicker();
  });
}

function updateCounter() {
  const el = document.getElementById('scanner-counter');
  if (el) el.textContent = `${checkedInCount} / ${registeredCount} checked in`;
}

async function refreshCounts() {
  if (!eventId) return;
  try {
    const supabase = getSupabase();
    const { data } = await supabase.rpc('admin_event_stats');
    const st = (data || []).find((s) => s.event_id === eventId);
    if (st) {
      registeredCount = st.registered_count;
      checkedInCount = st.checked_in_count;
      updateCounter();
    }
  } catch {
    // non-fatal
  }
}

async function renderEventPicker() {
  pinWrap.innerHTML = '';
  root.innerHTML = renderSkeleton('row', 4);
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('events')
      .select('id, title, venue, starts_at, ends_at, status')
      .eq('status', 'published')
      .order('starts_at', { ascending: true });

    if (error) throw error;
    const list = data || [];
    if (list.length === 0) {
      root.innerHTML = `<div class="empty-state stack-sm"><h2>No published events</h2><p class="muted">Publish an event first to use the scanner.</p><div><a href="/admin" class="btn btn-primary">Go to dashboard</a></div></div>`;
      return;
    }

    const nowMs = Date.now();
    const sevenDaysMs = nowMs + 7 * 24 * 60 * 60 * 1000;
    const priority = [];
    const others = [];
    for (const ev of list) {
      const startMs = new Date(ev.starts_at).getTime();
      const endMs = new Date(ev.ends_at).getTime();
      if ((endMs >= nowMs && startMs <= sevenDaysMs)) priority.push(ev);
      else others.push(ev);
    }

    const renderGroup = (title, items) =>
      items.length === 0
        ? ''
        : `
          <div class="stack-sm">
            <h2 style="font-size:1rem;margin:0;" class="muted">${escapeHtml(title)}</h2>
            ${items
              .map(
                (ev) => `
                  <button type="button" class="card stack-sm" data-pick-event="${escapeHtml(ev.id)}" style="text-align:left;cursor:pointer;width:100%;border:1px solid var(--border);">
                    <strong style="font-size:1.0625rem;">${escapeHtml(ev.title)}</strong>
                    <span class="muted" style="font-size:0.875rem;">${escapeHtml(formatEventDate(ev.starts_at, ev.ends_at))} · ${escapeHtml(ev.venue || 'TBA')}</span>
                  </button>
                `
              )
              .join('')}
          </div>
        `;

    root.innerHTML = `
      <div class="stack" style="max-width:640px;margin:0 auto;">
        <h1 style="margin:0;">Select event to scan</h1>
        ${renderGroup('Today & Next 7 Days', priority)}
        ${renderGroup('Other Published Events', others)}
      </div>
    `;

    root.querySelectorAll('[data-pick-event]').forEach((btn) => {
      btn.addEventListener('click', () => {
        eventId = btn.dataset.pickEvent;
        history.replaceState(null, '', `/admin/scanner?event=${encodeURIComponent(eventId)}`);
        loadScannerForEvent();
      });
    });
  } catch (err) {
    root.innerHTML = `<div class="banner banner-danger">${escapeHtml(err.message || 'Could not load events.')}</div>`;
  }
}

function showResultCard(result, retryPayload = null) {
  const el = document.getElementById('result');
  if (!el) return;
  el.classList.remove('is-faded');
  if (resultFadeTimer) window.clearTimeout(resultFadeTimer);

  let cls = 'result-danger';
  let html = '';

  if (result.kind === 'checked_in') {
    cls = 'result-success';
    html = `
      <div class="stack-sm">
        <div style="font-weight:700;color:var(--success);font-size:1.125rem;">Checked in</div>
        <div style="font-size:1.75rem;font-weight:700;line-height:1.2;">${escapeHtml(result.full_name)}</div>
        <div class="muted">${escapeHtml(result.organization || '')}</div>
        <div class="row-between">
          <span class="mono" style="font-weight:700;">${escapeHtml(result.ticket_id)}</span>
          <span class="muted" style="font-size:0.875rem;">${escapeHtml(formatTime(result.checked_in_at))}</span>
        </div>
      </div>
    `;
  } else if (result.kind === 'already_checked_in') {
    cls = 'result-warning';
    html = `
      <div class="stack-sm">
        <div style="font-weight:700;color:var(--warning);font-size:1.125rem;">Already checked in</div>
        <div style="font-size:1.5rem;font-weight:700;line-height:1.2;">${escapeHtml(result.full_name)}</div>
        <div class="muted">${escapeHtml(result.organization || '')}</div>
        <div class="row-between">
          <span class="mono" style="font-weight:700;">${escapeHtml(result.ticket_id)}</span>
          <span class="muted" style="font-size:0.875rem;">Originally at ${escapeHtml(formatTime(result.checked_in_at))}</span>
        </div>
      </div>
    `;
  } else if (result.kind === 'wrong_event') {
    html = `
      <div class="stack-sm">
        <div style="font-weight:700;color:var(--danger);font-size:1.125rem;">Ticket is for a different event</div>
        <div class="mono" style="font-weight:700;">${escapeHtml(result.ticket_id)}</div>
      </div>
    `;
  } else if (result.kind === 'ticket_not_found') {
    html = `
      <div class="stack-sm">
        <div style="font-weight:700;color:var(--danger);font-size:1.125rem;">Ticket not found</div>
        <div class="muted">Check the Ticket ID (${escapeHtml(result.ticket_id)}) or try manual entry.</div>
      </div>
    `;
  } else {
    html = `
      <div class="stack-sm">
        <div style="font-weight:700;color:var(--danger);font-size:1.125rem;">Couldn’t reach the server</div>
        <div><button type="button" class="btn btn-danger btn-sm" id="retry-checkin-btn">Retry</button></div>
      </div>
    `;
  }

  el.className = `result-card ${cls}`;
  el.innerHTML = html;

  if (retryPayload) {
    document.getElementById('retry-checkin-btn')?.addEventListener('click', () => {
      performCheckin(retryPayload.ticket_id);
    });
  }

  resultFadeTimer = window.setTimeout(() => {
    el.classList.add('is-faded');
  }, 8000);
}

function pushRecent(result) {
  recentScans.unshift(result);
  if (recentScans.length > 10) recentScans.pop();

  const list = document.getElementById('recent-list');
  if (!list) return;
  list.innerHTML = recentScans
    .map((item, idx) => {
      const status = item.kind === 'checked_in'
        ? 'Checked in'
        : item.kind === 'already_checked_in'
          ? 'Already checked in'
          : item.kind === 'ticket_not_found'
            ? 'Ticket not found'
            : 'Check failed';
      const label = item.full_name || item.ticket_id;
      return `
        <button type="button" class="recent-item" data-recent-idx="${idx}">
          <span><strong>${escapeHtml(label)}</strong> <span class="mono muted" style="font-size:0.8125rem;">${escapeHtml(item.ticket_id)}</span></span>
          <span class="recent-meta"><span class="muted" style="font-size:0.75rem;">${escapeHtml(formatTime(item.scannedAt))}</span><span class="chip chip-muted">${escapeHtml(status)}</span></span>
        </button>
      `;
    })
    .join('');

  list.querySelectorAll('[data-recent-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = recentScans[Number(btn.dataset.recentIdx)];
      if (item) showResultCard(item);
    });
  });
}

async function performCheckin(rawCode) {
  const ticketId = String(rawCode || '').trim().toUpperCase();
  if (!ticketId || !eventId) return;

  try {
    const res = await apiFetch('/api/checkin', {
      method: 'POST',
      body: { ticket_id: ticketId, event_id: eventId },
    });

    if (res.status === 'checked_in') {
      checkedInCount += 1;
      updateCounter();
      playBeep('success');
      navigator.vibrate?.(150);
      const item = { kind: 'checked_in', ...res, scannedAt: new Date().toISOString() };
      showResultCard(item);
      pushRecent(item);
    } else {
      playBeep('warning');
      navigator.vibrate?.([120, 80, 120]);
      const item = { kind: 'already_checked_in', ...res, scannedAt: new Date().toISOString() };
      showResultCard(item);
      pushRecent(item);
    }
  } catch (err) {
    playBeep('error');
    navigator.vibrate?.([200, 100, 200]);
    if (err.status === 409 && err.code === 'wrong_event') {
      const item = { kind: 'wrong_event', ticket_id: ticketId, scannedAt: new Date().toISOString() };
      showResultCard(item);
      pushRecent(item);
    } else if (err.status === 404) {
      const item = { kind: 'ticket_not_found', ticket_id: ticketId, scannedAt: new Date().toISOString() };
      showResultCard(item);
      pushRecent(item);
    } else {
      showResultCard({ kind: 'network_error', ticket_id: ticketId }, { ticket_id: ticketId });
    }
  }
}

async function startCamera() {
  const toggleBtn = document.getElementById('camera-toggle-btn');
  const camErr = document.getElementById('camera-error');
  const guide = document.getElementById('scan-guide');
  camErr.innerHTML = '';
  initAudio();

  if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    camErr.innerHTML = `<div class="banner banner-danger">Camera needs HTTPS.</div>`;
    return;
  }

  if (!window.Html5Qrcode) {
    camErr.innerHTML = `<div class="banner banner-danger">Scanner library failed to load. Please refresh.</div>`;
    return;
  }

  try {
    if (!html5Qr) {
      html5Qr = new window.Html5Qrcode('qr-reader');
    }
    toggleBtn.disabled = true;
    await html5Qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (decodedText) => {
        const code = String(decodedText || '').trim().toUpperCase();
        const now = Date.now();
        if (scanPaused) return;
        if (code === lastDecodedCode && now - lastDecodedAt < 2000) return;

        lastDecodedCode = code;
        lastDecodedAt = now;
        scanPaused = true;
        performCheckin(code);
        window.setTimeout(() => {
          scanPaused = false;
        }, 2000);
      },
      () => {}
    );

    cameraRunning = true;
    toggleBtn.textContent = 'Stop Camera';
    if (guide) guide.hidden = false;

    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch {
        wakeLock = null;
      }
    }
  } catch (err) {
    const msg = String(err?.message || err || '');
    let friendly = 'Could not start camera.';
    if (/NotAllowedError|Permission/i.test(msg)) {
      friendly = 'Allow camera access in your browser settings.';
    } else if (/NotFoundError|no camera|Requested device not found/i.test(msg)) {
      friendly = 'No camera found on this device.';
    } else if (/HTTPS|secure/i.test(msg)) {
      friendly = 'Camera needs HTTPS.';
    }
    camErr.innerHTML = `<div class="banner banner-danger">${escapeHtml(friendly)}</div>`;
  } finally {
    toggleBtn.disabled = false;
  }
}

async function stopCamera() {
  if (html5Qr && cameraRunning) {
    try {
      await html5Qr.stop();
    } catch {
      // ignore
    }
  }
  cameraRunning = false;
  const toggleBtn = document.getElementById('camera-toggle-btn');
  const guide = document.getElementById('scan-guide');
  if (toggleBtn) toggleBtn.textContent = 'Start Camera';
  if (guide) guide.hidden = true;
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

function renderScannerUi() {
  renderPinnedHeader();

  root.innerHTML = `
    <div class="scanner-grid">
      <section class="stack">
        <div class="camera-box">
          <div id="qr-reader"></div>
          <div id="scan-guide" class="scan-guide" hidden></div>
        </div>
        <div id="camera-error" aria-live="polite"></div>
        <button type="button" id="camera-toggle-btn" class="btn btn-primary scanner-btn" style="width:100%;">Start Camera</button>
      </section>

      <section class="stack">
        <div id="result" class="result-card" aria-live="assertive">
          <div class="muted" style="text-align:center;">Ready to scan a ticket QR or enter a Ticket ID below.</div>
        </div>

        <form id="manual-form" class="card stack-sm" novalidate>
          <label class="field-label" for="manual-ticket-input">Manual Ticket ID</label>
          <div class="manual-ticket-controls">
            <input id="manual-ticket-input" class="input mono" type="text" placeholder="SEM-123456" autocomplete="off" style="min-height:56px;font-size:1.125rem;">
            <button type="submit" class="btn btn-primary scanner-btn">Check In</button>
          </div>
          <span id="manual-hint" class="field-hint" hidden>Expected format: SEM-XXXXXX (you can still submit).</span>
        </form>

        <div class="stack-sm">
          <h2 style="font-size:1rem;margin:0;">Recent scans</h2>
          <div id="recent-list" class="stack-sm">
            <p class="muted" style="margin:0;font-size:0.875rem;">No scans in this session yet.</p>
          </div>
        </div>
      </section>
    </div>
  `;

  document.getElementById('camera-toggle-btn').addEventListener('click', () => {
    if (cameraRunning) stopCamera();
    else startCamera();
  });

  const manualForm = document.getElementById('manual-form');
  const manualInput = document.getElementById('manual-ticket-input');
  const manualHint = document.getElementById('manual-hint');

  manualInput.addEventListener('input', () => {
    const clean = manualInput.value.toUpperCase().trimStart();
    if (manualInput.value !== clean) manualInput.value = clean;
    const trimmed = clean.trim();
    manualHint.hidden = !trimmed || /^SEM-\d{6}$/.test(trimmed);
  });

  manualForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    initAudio();
    const val = manualInput.value.trim().toUpperCase();
    if (!val) {
      manualInput.focus();
      return;
    }
    manualInput.value = '';
    manualHint.hidden = true;
    await performCheckin(val);
    manualInput.focus();
  });
}

async function loadScannerForEvent() {
  if (!UUID_RE.test(eventId)) {
    renderEventPicker();
    return;
  }

  root.innerHTML = renderSkeleton('row', 3);
  try {
    const supabase = getSupabase();
    const [evRes, statsRes] = await Promise.all([
      supabase.from('events').select('id, title, venue, starts_at, ends_at, status').eq('id', eventId).maybeSingle(),
      supabase.rpc('admin_event_stats'),
    ]);

    if (evRes.error) throw evRes.error;
    if (!evRes.data) {
      renderEventPicker();
      return;
    }

    currentEvent = evRes.data;
    const st = (statsRes.data || []).find((s) => s.event_id === eventId);
    registeredCount = st?.registered_count || 0;
    checkedInCount = st?.checked_in_count || 0;

    renderScannerUi();

    let realtimeActive = false;
    const channel = supabase
      .channel(`scanner-${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'registrations', filter: `event_id=eq.${eventId}` },
        () => {
          refreshCounts();
        }
      )
      .subscribe((status) => {
        realtimeActive = status === 'SUBSCRIBED';
      });

    window.setInterval(() => {
      if (!realtimeActive && document.visibilityState === 'visible' && currentEvent) {
        refreshCounts();
      }
    }, 15_000);

    window.addEventListener('beforeunload', () => {
      stopCamera();
      supabase.removeChannel(channel);
    });
  } catch (err) {
    root.innerHTML = `<div class="banner banner-danger">${escapeHtml(err.message || 'Could not load scanner.')}</div>`;
  }
}

async function init() {
  const auth = await initAdminPage({ active: 'scanner' });
  if (!auth) return;

  if (UUID_RE.test(eventId)) {
    await loadScannerForEvent();
  } else {
    await renderEventPicker();
  }
}

init();
