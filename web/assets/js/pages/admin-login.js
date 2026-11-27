import { getSupabase } from '../supabase-client.js';
import { getProfile, getSession, safeNext } from '../auth.js';
import { escapeHtml } from '../ui.js';

const form = document.getElementById('admin-login-form');
const emailInput = document.getElementById('admin-email');
const passwordInput = document.getElementById('admin-password');
const pwToggle = document.getElementById('pw-toggle');
const submitBtn = document.getElementById('admin-signin-btn');
const errBox = document.getElementById('admin-login-error');

const params = new URLSearchParams(window.location.search);
const rawNext = safeNext(params.get('next'), '/admin');
const nextPath = rawNext.startsWith('/admin') && rawNext !== '/admin/login' ? rawNext : '/admin';

let failedAttempts = 0;
let lockoutUntil = 0;
let lockoutTimer = null;

function showError(msg) {
  errBox.innerHTML = `<div class="banner banner-danger">${escapeHtml(msg)}</div>`;
}

function startLockout() {
  lockoutUntil = Date.now() + 30_000;
  submitBtn.disabled = true;
  if (lockoutTimer) window.clearInterval(lockoutTimer);

  const tick = () => {
    const secs = Math.ceil((lockoutUntil - Date.now()) / 1000);
    if (secs <= 0) {
      window.clearInterval(lockoutTimer);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
    } else {
      submitBtn.textContent = `Try again in ${secs}s`;
    }
  };
  tick();
  lockoutTimer = window.setInterval(tick, 1000);
}

pwToggle.addEventListener('click', () => {
  const isPw = passwordInput.type === 'password';
  passwordInput.type = isPw ? 'text' : 'password';
  pwToggle.textContent = isPw ? 'Hide' : 'Show';
  pwToggle.setAttribute('aria-label', isPw ? 'Hide password' : 'Show password');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (Date.now() < lockoutUntil) return;

  errBox.innerHTML = '';
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!email || !password) {
    showError('Invalid credentials or no access.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Signing in…';

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.user) {
      throw new Error('auth_failed');
    }

    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profErr || !profile || profile.role !== 'admin') {
      await supabase.auth.signOut();
      throw new Error('not_admin');
    }

    window.location.replace(nextPath);
  } catch {
    passwordInput.value = '';
    failedAttempts += 1;
    showError('Invalid credentials or no access.');
    if (failedAttempts >= 5) {
      failedAttempts = 0;
      startLockout();
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
    }
  }
});

async function checkExisting() {
  try {
    const session = await getSession();
    if (!session) return;
    const profile = await getProfile();
    if (profile?.role === 'admin') {
      window.location.replace(nextPath);
    }
  } catch {
    // stay on login
  }
}

checkExisting();
