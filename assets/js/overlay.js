// Modal integrity for the app's overlays (add dialog, scan dialog, edit panel).
//
// One overlay at a time: focus moves into it, Tab cycles inside it, the page
// behind goes inert and stops scrolling, and closing returns focus to the
// control that opened it. Scope is exactly the app's own regions — the
// impeccable live bar and other body-level guests stay interactive.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const APP_REGIONS = ['.app-header', 'main', '.app-footer'];

let current = null;

/** @param {HTMLElement} root overlay element (must be outside the app regions) */
export function activateOverlay(root) {
  if (current) releaseOverlay();

  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const inerted = [];
  for (const selector of APP_REGIONS) {
    const el = document.querySelector(selector);
    if (el && !el.inert) {
      el.inert = true;
      inerted.push(el);
    }
  }
  document.body.classList.add('overlay-open');

  const focusable = () =>
    Array.from(root.querySelectorAll(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );

  const onKeydown = (event) => {
    if (event.key !== 'Tab') return;
    const items = focusable();
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!root.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onKeydown, true);

  current = { root, opener, inerted, onKeydown };

  const initial = root.querySelector('[data-autofocus]') || focusable()[0] || root;
  if (initial === root && !root.hasAttribute('tabindex')) {
    root.setAttribute('tabindex', '-1');
  }
  window.requestAnimationFrame(() => initial.focus?.());
}

export function releaseOverlay() {
  if (!current) return;
  const { root, opener, inerted, onKeydown } = current;
  current = null;

  document.removeEventListener('keydown', onKeydown, true);
  for (const el of inerted) el.inert = false;
  document.body.classList.remove('overlay-open');

  const focusWasInside = root.contains(document.activeElement);
  if (opener?.isConnected && (focusWasInside || document.activeElement === document.body)) {
    opener.focus();
  }
}

/** Close every overlay-level state a removed node may still own. */
export function releaseOverlayFor(root) {
  if (current && current.root === root) releaseOverlay();
}
