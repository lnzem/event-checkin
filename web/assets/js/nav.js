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

  const path = window.location.pathname;
  const activePage = active || (
    path === '/tickets'
      ? 'tickets'
      : path === '/'
        ? 'home'
        : 'events'
  );
  const ticketsHref = session ? '/tickets' : '/login?next=%2Ftickets';
  const profileHref = session ? '/tickets#my-details-panel' : '/login';

  if (headerMount) {
    const email = session?.user?.email || '';
    const authHtml = session
      ? `
        <div class="avatar-menu">
          <button type="button" class="avatar-btn" aria-expanded="false" aria-haspopup="menu" aria-label="Account menu">
            <span class="avatar-circle"><img src="/web/assets/icons/user.svg" alt=""></span>
          </button>
          <div class="dropdown-menu" role="menu" hidden>
            <div class="muted account-email">${escapeHtml(email)}</div>
            <a class="dropdown-item" href="${profileHref}" role="menuitem">My details</a>
            <a class="dropdown-item" href="/tickets" role="menuitem">My tickets</a>
            <button type="button" class="dropdown-item" data-action="logout" role="menuitem">Log out</button>
          </div>
        </div>
      `
      : `<a class="nav-link nav-profile-link" href="/login"><span class="nav-link-icon"><img src="/web/assets/icons/user.svg" alt=""></span>Log in</a>`;

    headerMount.className = 'site-header';
    headerMount.innerHTML = `
      <div class="container site-header-inner">
        <a class="brand" href="/" aria-label="Regismeow home">
          <span class="brand-symbol" aria-hidden="true">
            <img class="brand-badge" src="/web/assets/icons/regismeow-badge.svg" alt="">
            <img class="brand-signal" src="/web/assets/icons/regismeow-signal.svg" alt="">
          </span>
          <span class="brand-name">regismeow</span>
        </a>
        <nav class="primary-nav" aria-label="Main navigation">
          <a class="nav-link" href="/"${activePage === 'home' ? ' aria-current="page"' : ''}><span class="nav-link-icon"><img src="/web/assets/icons/home.svg" alt=""></span>Home</a>
          <a class="nav-link" href="/explore"${activePage === 'events' ? ' aria-current="page"' : ''}><span class="nav-link-icon"><img src="/web/assets/icons/search.svg" alt=""></span>Explore</a>
          <a class="nav-link" href="${ticketsHref}"${activePage === 'tickets' ? ' aria-current="page"' : ''}><span class="nav-link-icon"><img src="/web/assets/icons/bell.svg" alt=""></span>My tickets</a>
        </nav>
        <div class="nav-actions">${authHtml}</div>
        <a class="mobile-profile-link" href="${profileHref}" aria-label="Profile">
          <img src="/web/assets/icons/user.svg" alt="">
        </a>
      </div>
    `;

    let mobileNav = document.getElementById('mobile-bottom-nav');
    if (!mobileNav) {
      mobileNav = document.createElement('nav');
      mobileNav.id = 'mobile-bottom-nav';
      mobileNav.className = 'mobile-bottom-nav';
      mobileNav.setAttribute('aria-label', 'Main navigation');
      document.body.appendChild(mobileNav);
    }
    mobileNav.innerHTML = `
      <a href="/"${activePage === 'home' ? ' aria-current="page"' : ''}>
        <span class="mobile-nav-icon"><img src="/web/assets/icons/home.svg" alt=""></span><span>Home</span>
      </a>
      <a href="/explore"${activePage === 'events' ? ' aria-current="page"' : ''}>
        <span class="mobile-nav-icon"><img src="/web/assets/icons/search.svg" alt=""></span><span>Explore</span>
      </a>
      <a href="${ticketsHref}"${activePage === 'tickets' ? ' aria-current="page"' : ''}>
        <span class="mobile-nav-icon"><img src="/web/assets/icons/bell.svg" alt=""></span><span>Tickets</span>
      </a>
      <a href="${profileHref}">
        <span class="mobile-nav-icon"><img src="/web/assets/icons/user.svg" alt=""></span><span>Profile</span>
      </a>
    `;
    document.body.classList.add('has-mobile-nav');

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
      ? `<a class="muted" href="/admin/login">Staff</a>`
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
