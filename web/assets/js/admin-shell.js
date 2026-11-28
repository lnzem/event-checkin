import { getSupabase } from './supabase-client.js';
import { requireAdmin, signOut } from './auth.js';
import { setUnauthorizedHandler } from './api.js';
import { escapeHtml, toast } from './ui.js';

export async function initAdminPage({ active = 'events' } = {}) {
  document.body.classList.add('admin-body');

  const auth = await requireAdmin();
  if (!auth) return null;

  const { session, profile } = auth;
  const email = session.user?.email || '';

  setUnauthorizedHandler(async () => {
    toast('Your session expired.', { type: 'warning' });
    await signOut('/admin/login');
  });

  const supabase = getSupabase();
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      window.location.replace('/admin/login');
    }
  });

  const headerMount = document.getElementById('admin-header');
  if (headerMount) {
    headerMount.className = 'site-header';
    headerMount.innerHTML = `
      <div class="container site-header-inner">
        <div class="row">
          <a class="brand" href="/admin">
            <span class="brand-symbol" aria-hidden="true">
              <img class="brand-badge" src="/web/assets/icons/regismeow-badge.svg" alt="">
              <img class="brand-signal" src="/web/assets/icons/regismeow-signal.svg" alt="">
            </span>
            <span class="brand-name">regismeow</span>
          </a>
          <span class="admin-badge">Admin</span>
        </div>
        <nav class="nav-actions" aria-label="Admin navigation">
          <a class="nav-link" href="/admin"${active === 'events' ? ' aria-current="page"' : ''}>Events</a>
          <a class="nav-link" href="/admin/scanner"${active === 'scanner' ? ' aria-current="page"' : ''}>Scanner</a>
          <span class="muted" style="font-size:0.8125rem;display:none;" data-admin-email>${escapeHtml(email)}</span>
          <button type="button" class="btn btn-secondary btn-sm" data-action="admin-logout">Log out</button>
        </nav>
      </div>
    `;

    const emailEl = headerMount.querySelector('[data-admin-email]');
    if (emailEl && window.innerWidth >= 768) {
      emailEl.style.display = 'inline';
    }

    const logoutBtn = headerMount.querySelector('[data-action="admin-logout"]');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => signOut('/admin/login'));
    }
  }

  return { session, profile };
}
