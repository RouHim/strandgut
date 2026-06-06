const STORAGE_KEY = 'theme';
const html = document.documentElement;
const toggleBtn = document.getElementById('theme-toggle');

function getEffectiveTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch (_) {}
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme) {
  html.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (_) {}
  updateToggleUI(theme);
}

function toggleTheme() {
  const current = getEffectiveTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
}

function updateToggleUI(theme) {
  if (!toggleBtn) return;
  const sun = toggleBtn.querySelector('.theme-icon-sun');
  const moon = toggleBtn.querySelector('.theme-icon-moon');
  const isDark = theme === 'dark';
  if (sun) sun.style.display = isDark ? 'block' : 'none';
  if (moon) moon.style.display = isDark ? 'none' : 'block';
  toggleBtn.setAttribute('aria-checked', String(isDark));
  toggleBtn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
}

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
mediaQuery.addEventListener('change', (e) => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return;
  } catch (_) {}
  setTheme(e.matches ? 'dark' : 'light');
});

let initialTheme = getEffectiveTheme();
html.setAttribute('data-theme', initialTheme);
updateToggleUI(initialTheme);

if (toggleBtn) {
  toggleBtn.addEventListener('click', toggleTheme);
}

