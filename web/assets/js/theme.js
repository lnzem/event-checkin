const sunIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"></path></svg>';
const moonIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 15.4A8.5 8.5 0 0 1 8.6 3.2 8.7 8.7 0 1 0 20.8 15.4Z"></path></svg>';

const themeButton = document.createElement('button');
themeButton.type = 'button';
themeButton.className = 'theme-toggle';
themeButton.setAttribute('aria-label', 'Switch to dark mode');
themeButton.title = 'Switch to dark mode';
document.body.appendChild(themeButton);

function updateThemeButton() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  themeButton.innerHTML = `${isDark ? sunIcon : moonIcon}<span class="sr-only">${label}</span>`;
  themeButton.setAttribute('aria-label', label);
  themeButton.title = label;
}

function setTheme(theme, save = true) {
  document.documentElement.dataset.theme = theme;
  if (save) {
    try { localStorage.setItem('live-theme', theme); } catch { /* keep the current page theme */ }
  }
  updateThemeButton();
}

themeButton.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

window.addEventListener('storage', (event) => {
  if (event.key === 'live-theme' && (event.newValue === 'dark' || event.newValue === 'light')) {
    setTheme(event.newValue, false);
  }
});

updateThemeButton();
