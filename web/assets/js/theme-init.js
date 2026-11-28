(() => {
  let theme = 'light';
  try {
    const saved = localStorage.getItem('live-theme');
    theme = saved === 'dark' || saved === 'light'
      ? saved
      : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } catch {
    theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
})();
