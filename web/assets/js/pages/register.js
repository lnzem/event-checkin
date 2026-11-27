import { TURNSTILE_SITE_KEY } from '../config.js';
import { renderPublicNav } from '../nav.js';
import { getSupabase } from '../supabase-client.js';
import { getProfile, getSession } from '../auth.js';
import { apiFetch } from '../api.js';
import { downloadIcs, formatEventDate, getEventPhase, isRegistrationOpen, spotsLeft } from '../events.js';
import { escapeHtml, toast } from '../ui.js';

const root = document.getElementById('register-root');
const params = new URLSearchParams(window.location.search);
const eventId = params.get('event')?.trim() || '';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PH_MOBILE_RE = /^(09\d{9}|\+639\d{9})$/;

let currentEvent = null;
let currentSession = null;
let currentProfile = null;
let turnstileToken = '';

function renderStateCard(title, message, btnText = 'Browse events', btnHref = '/') {
  root.innerHTML = `
    <div class="empty-state stack-sm">
      <h1 style="font-size:1.5rem;margin:0;">${escapeHtml(title)}</h1>
      <p class="muted" style="margin:0;">${escapeHtml(message)}</p>
      <div><a href="${escapeHtml(btnHref)}" class="btn btn-primary">${escapeHtml(btnText)}</a></div>
    </div>
  `;
}

function renderUnavailable(ev) {
  const phase = getEventPhase(ev);
  if (ev.status === 'cancelled') {
    renderStateCard('Registration closed', 'This event was cancelled.', 'Back to events', '/');
  } else if (phase === 'past') {
    renderStateCard('Event has ended', 'Registration is closed because this event has already ended.', 'Back to events', '/');
  } else if (spotsLeft(ev) <= 0) {
    renderStateCard('Event full', 'All spots for this event have been taken.', 'Browse other events', '/');
  } else {
    renderStateCard('Registration closed', 'Registration is not currently available for this event.', 'Back to events', '/');
  }
}

function setFieldError(input, errEl, msg) {
  if (msg) {
    input.setAttribute('aria-invalid', 'true');
    errEl.textContent = `! ${msg}`;
    errEl.hidden = false;
  } else {
    input.removeAttribute('aria-invalid');
    errEl.textContent = '';
    errEl.hidden = true;
  }
}

function validateField(name, value) {
  const v = String(value ?? '').trim();
  if (name === 'full_name') {
    if (v.length < 2 || v.length > 100) return 'Full name must be at least 2 characters.';
  } else if (name === 'email') {
    if (!v || v.length > 254 || !EMAIL_RE.test(v)) return 'Enter a valid email address.';
  } else if (name === 'organization') {
    if (v.length < 2 || v.length > 100) return 'Organization must be at least 2 characters.';
  } else if (name === 'contact_number') {
    const clean = v.replace(/[\s-]+/g, '');
    if (!PH_MOBILE_RE.test(clean)) return 'Enter a valid PH mobile number (09XXXXXXXXX or +639XXXXXXXXX).';
  }
  return '';
}

function renderForm() {
  const ev = currentEvent;
  const left = spotsLeft(ev);
  const dateLine = formatEventDate(ev.starts_at, ev.ends_at);
  const thumbHtml = ev.cover_image_url
    ? `<img src="${escapeHtml(ev.cover_image_url)}" alt="" style="width:72px;height:54px;object-fit:cover;border-radius:8px;flex-shrink:0;">`
    : `<div style="width:72px;height:54px;border-radius:8px;background:var(--accent-soft);flex-shrink:0;"></div>`;

  const isSignedIn = Boolean(currentSession?.user);
  const prefillEmail = isSignedIn ? currentSession.user.email || '' : '';
  const prefillName = currentProfile?.full_name || '';
  const prefillOrg = currentProfile?.organization || '';
  const prefillPhone = currentProfile?.contact_number || '';

  const showHint = !isSignedIn && localStorage.getItem('dismissed_login_hint') !== '1';
  const loginNext = encodeURIComponent(`/register?event=${ev.id}`);
  const loginHintHtml = showHint
    ? `
      <div id="login-hint-banner" class="banner">
        <span>Want your tickets saved? <a href="/login?next=${loginNext}">Log in</a> (optional)</span>
        <button type="button" class="btn btn-ghost btn-sm" id="dismiss-login-hint" aria-label="Dismiss note">×</button>
      </div>
    `
    : '';

  const turnstileHtml = TURNSTILE_SITE_KEY
    ? `<div id="turnstile-widget" style="min-height:65px;"></div>`
    : '';

  root.innerHTML = `
    <div>
      <a href="/event?id=${encodeURIComponent(ev.id)}" class="muted" style="font-weight:500;">‹ Back to event</a>
    </div>

    <div class="card row" style="align-items:center;gap:14px;">
      ${thumbHtml}
      <div class="stack-sm" style="gap:2px;min-width:0;flex:1;">
        <h1 style="font-size:1.125rem;margin:0;">${escapeHtml(ev.title)}</h1>
        <div class="muted" style="font-size:0.875rem;">${escapeHtml(dateLine)}</div>
        <div class="muted" style="font-size:0.875rem;">${escapeHtml(ev.venue || 'Venue TBA')} · <strong>${escapeHtml(String(left))} ${left === 1 ? 'spot' : 'spots'} left</strong></div>
      </div>
    </div>

    ${loginHintHtml}

    <section id="form-section" class="card stack">
      <h2 style="margin:0;font-size:1.25rem;">Attendee registration</h2>
      <div id="form-banner" aria-live="polite"></div>

      <form id="register-form" class="stack" novalidate>
        <div class="field">
          <label class="field-label" for="reg-full-name">Full Name</label>
          <input id="reg-full-name" name="full_name" class="input" type="text" required autocomplete="name" value="${escapeHtml(prefillName)}" aria-describedby="err-full-name">
          <span id="err-full-name" class="field-error" hidden></span>
        </div>

        <div class="field">
          <label class="field-label" for="reg-email">Email Address</label>
          <input id="reg-email" name="email" class="input" type="email" required autocomplete="email" value="${escapeHtml(prefillEmail)}" ${isSignedIn ? 'readonly' : ''} aria-describedby="err-email">
          <span id="err-email" class="field-error" hidden></span>
        </div>

        <div class="field">
          <label class="field-label" for="reg-organization">Organization</label>
          <input id="reg-organization" name="organization" class="input" type="text" required autocomplete="organization" value="${escapeHtml(prefillOrg)}" aria-describedby="err-organization">
          <span id="err-organization" class="field-error" hidden></span>
        </div>

        <div class="field">
          <label class="field-label" for="reg-contact">Contact Number</label>
          <input id="reg-contact" name="contact_number" class="input" type="tel" required autocomplete="tel" value="${escapeHtml(prefillPhone)}" aria-describedby="hint-contact err-contact">
          <span id="hint-contact" class="field-hint">e.g. 09171234567</span>
          <span id="err-contact" class="field-error" hidden></span>
        </div>

        ${turnstileHtml}

        <button type="submit" id="register-submit-btn" class="btn btn-primary" style="width:100%;">Register</button>
      </form>
    </section>

    <section id="success-section" class="card stack success-animate" hidden></section>
  `;

  document.getElementById('dismiss-login-hint')?.addEventListener('click', () => {
    localStorage.setItem('dismissed_login_hint', '1');
    document.getElementById('login-hint-banner')?.remove();
  });

  if (TURNSTILE_SITE_KEY && !window.turnstile) {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => {
      window.turnstile?.render('#turnstile-widget', {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (t) => { turnstileToken = t; },
      });
    };
    document.head.appendChild(s);
  } else if (TURNSTILE_SITE_KEY && window.turnstile) {
    window.turnstile.render('#turnstile-widget', {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (t) => { turnstileToken = t; },
    });
  }

  const form = document.getElementById('register-form');
  const formSection = document.getElementById('form-section');
  const successSection = document.getElementById('success-section');
  const formBanner = document.getElementById('form-banner');
  const submitBtn = document.getElementById('register-submit-btn');

  const fieldMap = {
    full_name: { input: document.getElementById('reg-full-name'), err: document.getElementById('err-full-name') },
    email: { input: document.getElementById('reg-email'), err: document.getElementById('err-email') },
    organization: { input: document.getElementById('reg-organization'), err: document.getElementById('err-organization') },
    contact_number: { input: document.getElementById('reg-contact'), err: document.getElementById('err-contact') },
  };

  for (const [name, { input, err }] of Object.entries(fieldMap)) {
    input.addEventListener('blur', () => {
      setFieldError(input, err, validateField(name, input.value));
    });
  }

  let submitting = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;

    formBanner.innerHTML = '';
    let firstInvalid = null;

    for (const [name, { input, err }] of Object.entries(fieldMap)) {
      const msg = validateField(name, input.value);
      setFieldError(input, err, msg);
      if (msg && !firstInvalid) firstInvalid = input;
    }

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const emailVal = fieldMap.email.input.value.trim().toLowerCase();
    const payload = {
      event_id: ev.id,
      full_name: fieldMap.full_name.input.value.trim(),
      email: emailVal,
      organization: fieldMap.organization.input.value.trim(),
      contact_number: fieldMap.contact_number.input.value.replace(/[\s-]+/g, '').trim(),
      ...(TURNSTILE_SITE_KEY ? { turnstile_token: turnstileToken } : {}),
    };

    submitting = true;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Registering…';

    try {
      const res = await apiFetch('/api/register', {
        method: 'POST',
        body: payload,
      });

      showSuccess(res, emailVal);
    } catch (err) {
      if (err.code === 'validation_error' && err.fields) {
        let focusTarget = null;
        for (const [key, msg] of Object.entries(err.fields)) {
          if (fieldMap[key]) {
            setFieldError(fieldMap[key].input, fieldMap[key].err, msg);
            if (!focusTarget) focusTarget = fieldMap[key].input;
          }
        }
        if (focusTarget) focusTarget.focus();
        else formBanner.innerHTML = `<div class="banner banner-danger">${escapeHtml(err.message)}</div>`;
      } else if (err.code === 'duplicate_registration') {
        formBanner.innerHTML = `
          <div class="banner banner-warning" style="flex-direction:column;align-items:flex-start;">
            <span>This email is already registered for this event.</span>
            <button type="button" class="btn btn-secondary btn-sm" id="resend-dup-btn">Resend my ticket</button>
          </div>
        `;
        document.getElementById('resend-dup-btn')?.addEventListener('click', async (btnEv) => {
          const btn = btnEv.currentTarget;
          btn.disabled = true;
          btn.textContent = 'Sending…';
          try {
            await apiFetch('/api/resend-ticket', { method: 'POST', auth: false, body: { email: emailVal } });
            formBanner.innerHTML = `<div class="banner banner-success">If that email has tickets, we’ve sent them.</div>`;
          } catch {
            toast('Could not resend right now. Please try again.', { type: 'danger' });
            btn.disabled = false;
            btn.textContent = 'Resend my ticket';
          }
        });
      } else if (err.code === 'event_full' || err.code === 'event_closed') {
        renderStateCard(
          err.code === 'event_full' ? 'Event full' : 'Registration closed',
          err.message,
          'Browse events',
          '/'
        );
      } else if (err.status === 429) {
        formBanner.innerHTML = `<div class="banner banner-danger">Too many attempts. Please wait a minute and try again.</div>`;
      } else {
        formBanner.innerHTML = `
          <div class="banner banner-danger">
            <span>${escapeHtml(err.message || 'Something went wrong. Please try again.')}</span>
            <button type="button" class="btn btn-secondary btn-sm" id="retry-submit-btn">Retry</button>
          </div>
        `;
        document.getElementById('retry-submit-btn')?.addEventListener('click', () => form.requestSubmit());
      }
    } finally {
      submitting = false;
      if (submitBtn.isConnected) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Register';
      }
    }
  });

  function showSuccess(res, submittedEmail) {
    formSection.hidden = true;
    successSection.hidden = false;

    const emailNote = res.qr_sent
      ? `A copy was sent to ${submittedEmail}.`
      : `We couldn’t send the email right now. Please download your QR above.`;

    const signedOutPrompt = !isSignedIn
      ? `<p class="muted" style="margin:0;font-size:0.875rem;text-align:center;"><a href="/login">Log in with this email</a> to keep this ticket in My Tickets.</p>`
      : '';

    successSection.innerHTML = `
      <div class="stack" style="text-align:center;">
        <h2 id="success-heading" tabindex="-1" style="margin:0;color:var(--success);">You’re registered!</h2>
        <div class="qr-box">
          <img src="${escapeHtml(res.qr_data_url)}" alt="QR ticket ${escapeHtml(res.ticket_id)}">
        </div>
        <div class="mono" style="font-size:1.5rem;font-weight:700;letter-spacing:0.08em;">${escapeHtml(res.ticket_id)}</div>
        <div class="stack-sm" style="gap:4px;">
          <div style="font-weight:600;font-size:1.0625rem;">${escapeHtml(res.full_name)}</div>
          <div class="muted">${escapeHtml(res.event?.title || ev.title)}</div>
          <div class="muted" style="font-size:0.875rem;">${escapeHtml(formatEventDate(res.event?.starts_at || ev.starts_at, ev.ends_at))} · ${escapeHtml(res.event?.venue || ev.venue || 'TBA')}</div>
        </div>
        <p class="muted" style="margin:0;font-size:0.875rem;">Show this QR at the entrance.</p>
        <p class="muted" style="margin:0;font-size:0.875rem;">${escapeHtml(emailNote)}</p>
        ${signedOutPrompt}
        <div class="row" style="justify-content:center;padding-top:8px;">
          <a class="btn btn-primary" href="${escapeHtml(res.qr_data_url)}" download="ticket-${escapeHtml(res.ticket_id)}.png">Download QR</a>
          <button type="button" class="btn btn-secondary" id="success-cal-btn">Add to calendar</button>
          <button type="button" class="btn btn-secondary" id="register-another-btn">Register another</button>
          <a class="btn btn-ghost" href="/">Back to events</a>
        </div>
      </div>
    `;

    document.getElementById('success-cal-btn')?.addEventListener('click', () => downloadIcs(ev));
    document.getElementById('register-another-btn')?.addEventListener('click', () => {
      form.reset();
      if (isSignedIn) {
        fieldMap.email.input.value = prefillEmail;
      }
      for (const { input, err } of Object.values(fieldMap)) {
        setFieldError(input, err, '');
      }
      formBanner.innerHTML = '';
      successSection.hidden = true;
      formSection.hidden = false;
      fieldMap.full_name.input.focus();
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById('success-heading')?.focus();
  }
}

async function init() {
  renderPublicNav();

  if (!UUID_RE.test(eventId)) {
    renderStateCard('Choose an event first', 'Select an event from the list before registering.', 'Browse events', '/');
    return;
  }

  root.innerHTML = `<div class="card stack"><div class="skeleton" style="height:28px;width:60%;"></div><div class="skeleton" style="height:220px;width:100%;"></div></div>`;

  try {
    const supabase = getSupabase();
    const { data: ev, error } = await supabase
      .from('events_public')
      .select('id, title, description, venue, starts_at, ends_at, capacity, cover_image_url, status, registered_count')
      .eq('id', eventId)
      .maybeSingle();

    if (error) throw error;
    if (!ev) {
      renderStateCard('Event not available', 'This event could not be found or is not open for registration.', 'Browse events', '/');
      return;
    }

    currentEvent = ev;
    document.title = `Register: ${ev.title} — Event Check-In`;

    if (!isRegistrationOpen(ev)) {
      renderUnavailable(ev);
      return;
    }

    try {
      currentSession = await getSession();
      if (currentSession) {
        currentProfile = await getProfile();
      }
    } catch {
      currentSession = null;
      currentProfile = null;
    }

    renderForm();
  } catch (err) {
    console.error('Register page load error:', err);
    root.innerHTML = `
      <div class="empty-state stack-sm">
        <h2>Couldn’t load registration form</h2>
        <p class="muted" style="margin:0;">Please check your connection and try again.</p>
        <div><button type="button" class="btn btn-primary" id="retry-reg-load">Retry</button></div>
      </div>
    `;
    document.getElementById('retry-reg-load')?.addEventListener('click', init);
  }
}

init();
