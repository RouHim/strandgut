// Language detection + translation lookup.
//
// This lives outside app.js on purpose: modules that only need `t()` must not
// import the entry module. The entry script is loaded as
// `app.js?v=<version>` while internal imports resolve to `./app.js`, so any
// import of app.js instantiates a second copy and runs its DOM wiring twice.

import en from './i18n/en.js';
import de from './i18n/de.js';

const BUNDLES = { en, de };

function detectedLanguage() {
  return navigator.language.startsWith('de') ? 'de' : 'en';
}

let currentLanguage = detectedLanguage();
let translations = BUNDLES[currentLanguage];
document.documentElement.lang = currentLanguage;

/**
 * Apply the configured language, overriding browser detection.
 *
 * Unknown or empty values keep the detected language, so a config typo cannot
 * leave the UI without translations.
 */
export function setLanguage(language) {
  if (!language || !Object.hasOwn(BUNDLES, language)) return;
  currentLanguage = language;
  translations = BUNDLES[currentLanguage];
  document.documentElement.lang = currentLanguage;
}

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
