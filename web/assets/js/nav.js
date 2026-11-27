import { SHOW_STAFF_LINK, SITE_NAME } from './config.js';
import { getSession, signOut } from './auth.js';
import { escapeHtml } from './ui.js';

export async function renderPublicNav({ active = '' } = {}) {
  const headerMount = document.getElementById('site-header');
  const footerMount = document.getElementById('site-footer');

  let session = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }

  if (headerMount) {
    const email = session?.user?.email || '';
    const initial = email ? email.charAt(0).toUpperCase() : 'U';

    const authHtml = session
      ? `
        <a class="nav-link" href="/tickets"${active === 'tickets' ? ' aria-current="page"' : ''}>My Tickets</a>
        <div class="avatar-menu">
          <button type="button" class="avatar-btn" aria-expanded="false" aria-haspopup="menu" aria-label="Account menu">
            <span class="avatar-circle">${escapeHtml(initial)}</span>
            <span class="sr-only">Account menu</span>
          </button>
          <div class="dropdown-menu" role="menu" hidden>
            <div class="muted" style="padding:6px 12px;font-size:0.8125rem;word-break:break-all;">${escapeHtml(email)}</div>
            <a class="dropdown-item" href="/tickets" role="menuitem">My Tickets</a>
            <button type="button" class="dropdown-item" data-action="logout" role="menuitem">Log out</button>
          </div>
        </div>
      `
      : `<a class="btn btn-secondary btn-sm" href="/login">Log in</a>`;

    headerMount.className = 'site-header';
    headerMount.innerHTML = `
      <div class="container site-header-inner">
        <a class="brand" href="/">
          <span class="brand-mark" aria-hidden="true">E</span>
          <span>${escapeHtml(SITE_NAME)}</span>
        </a>
        <nav class="nav-actions" aria-label="Main navigation">
          <a class="nav-link" href="/#events"${active === 'events' ? ' aria-current="page"' : ''}>Events</a>
          ${authHtml}
        </nav>
      </div>
    `;

    const avatarBtn = headerMount.querySelector('.avatar-btn');
    const menu = headerMount.querySelector('.dropdown-menu');
    if (avatarBtn && menu) {
      avatarBtn.addEventListener('click', () => {
        const expanded = avatarBtn.getAttribute('aria-expanded') === 'true';
        avatarBtn.setAttribute('aria-expanded', String(!expanded));
        menu.hidden = expanded;
      });
      document.addEventListener('click', (e) => {
        if (!headerMount.contains(e.target)) {
          avatarBtn.setAttribute('aria-expanded', 'false');
          menu.hidden = true;
        }
      });
    }

    const logoutBtn = headerMount.querySelector('[data-action="logout"]');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => signOut('/'));
    }
  }

  if (footerMount) {
    const year = new Date().getFullYear();
    const staffLink = SHOW_STAFF_LINK
      ? `<a class="muted" href="/admin/login" style="font-size:0.8125rem;">Staff</a>`
      : '';
    footerMount.className = 'site-footer';
    footerMount.innerHTML = `
      <div class="container row-between">
        <span>${escapeHtml(SITE_NAME)} · © ${year}</span>
        <div class="row">
          <span>Questions? Contact the event organizer.</span>
          ${staffLink}
        </div>
      </div>
    `;
  }
}
