import { GOOGLE_LOGIN } from '../config.js';
import { getSupabase } from '../supabase-client.js';
import { getSession, safeNext } from '../auth.js';
import { escapeHtml } from '../ui.js';

const content = document.getElementById('login-content');
const params = new URLSearchParams(window.location.search);
const nextPath = safeNext(params.get('next'), '/tickets');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let cooldownTimer = null;

async function handleSignedIn() {
  const supabase = getSupabase();
  if (!sessionStorage.getItem('tickets_claimed')) {
    try {
      await supabase.rpc('claim_my_registrations');
      sessionStorage.setItem('tickets_claimed', '1');
    } catch (err) {
      console.error('claim_my_registrations error:', err);
    }
  }
  window.location.replace(nextPath);
}

function renderEmailStep(prefillEmail = '', errorBanner = '') {
  const googleHtml = GOOGLE_LOGIN
    ? `
      <button type="button" id="google-login-btn" class="btn btn-secondary" style="width:100%;">Continue with Google</button>
      <div class="divider">or</div>
    `
    : '';

  content.innerHTML = `
    <div class="stack">
      ${errorBanner ? `<div class="banner banner-danger">${escapeHtml(errorBanner)}</div>` : ''}
      ${googleHtml}
      <form id="otp-form" class="stack" novalidate>
        <div class="field">
          <label class="field-label" for="login-email">Email address</label>
          <input id="login-email" class="input" type="email" required autocomplete="email" value="${escapeHtml(prefillEmail)}" placeholder="you@example.com" aria-describedby="login-email-err">
          <span id="login-email-err" class="field-error" hidden></span>
        </div>
        <button type="submit" id="send-link-btn" class="btn btn-primary" style="width:100%;">Send login link</button>
      </form>
    </div>
  `;

  if (GOOGLE_LOGIN) {
    document.getElementById('google-login-btn')?.addEventListener('click', async () => {
      const supabase = getSupabase();
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/login?next=${encodeURIComponent(nextPath)}`,
        },
      });
    });
  }

  const form = document.getElementById('otp-form');
  const emailInput = document.getElementById('login-email');
  const errEl = document.getElementById('login-email-err');
  const submitBtn = document.getElementById('send-link-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      emailInput.setAttribute('aria-invalid', 'true');
      errEl.textContent = '! Enter a valid email address.';
      errEl.hidden = false;
      emailInput.focus();
      return;
    }

    emailInput.removeAttribute('aria-invalid');
    errEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Sending…';

    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/login?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (error) throw error;
      renderCheckEmailStep(email);
    } catch {
      renderEmailStep(email, "We couldn't send the link. Please try again in a minute.");
    }
  });
}

function renderCheckEmailStep(email) {
  let secondsLeft = 60;
  content.innerHTML = `
    <div class="stack" style="text-align:center;">
      <div style="font-size:2rem;" aria-hidden="true">✉️</div>
      <h2 style="margin:0;font-size:1.25rem;">Check your email</h2>
      <p class="muted" style="margin:0;">We sent a login link to <strong>${escapeHtml(email)}</strong>.</p>
      <div id="resend-msg" aria-live="polite"></div>
      <button type="button" id="resend-link-btn" class="btn btn-secondary" disabled style="width:100%;">Resend in 60s</button>
      <button type="button" id="diff-email-btn" class="btn btn-ghost btn-sm">Use a different email</button>
    </div>
  `;

  const resendBtn = document.getElementById('resend-link-btn');
  const resendMsg = document.getElementById('resend-msg');

  if (cooldownTimer) window.clearInterval(cooldownTimer);
  cooldownTimer = window.setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      window.clearInterval(cooldownTimer);
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend login link';
    } else {
      resendBtn.textContent = `Resend in ${secondsLeft}s`;
    }
  }, 1000);

  resendBtn.addEventListener('click', async () => {
    resendBtn.disabled = true;
    resendBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Sending…';
    resendMsg.innerHTML = '';

    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/login?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (error) throw error;
      renderCheckEmailStep(email);
    } catch {
      resendMsg.innerHTML = `<div class="banner banner-danger">We couldn’t send the link. Please try again in a minute.</div>`;
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend login link';
    }
  });

  document.getElementById('diff-email-btn')?.addEventListener('click', () => {
    if (cooldownTimer) window.clearInterval(cooldownTimer);
    renderEmailStep(email);
  });
}

async function init() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const urlError = params.get('error_description') || hashParams.get('error_description');

  const supabase = getSupabase();
  supabase.auth.onAuthStateChange((event, session) => {
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
      handleSignedIn();
    }
  });

  const existing = await getSession();
  if (existing) {
    await handleSignedIn();
    return;
  }

  if (urlError) {
    renderEmailStep('', 'That link has expired. Enter your email to request a new one.');
  } else {
    renderEmailStep();
  }
}

init();
