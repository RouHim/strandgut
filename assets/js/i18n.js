// Language detection + translation lookup.
//
// This lives outside app.js on purpose: modules that only need `t()` must not
// import the entry module. The entry script is loaded as
// `app.js?v=<version>` while internal imports resolve to `./app.js`, so any
// import of app.js instantiates a second copy and runs its DOM wiring twice.

import en from './i18n/en.js';
import de from './i18n/de.js';

const lang = navigator.language.startsWith('de') ? 'de' : 'en';
document.documentElement.lang = lang;
const translations = lang === 'de' ? de : en;

export function t(key) {
  return translations[key] || key;
}

export function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
}

// Rendered components created after init (grid dots, dialogs) resolve their
// strings through this global.
window.__t = t;
