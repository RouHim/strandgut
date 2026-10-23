// Modal integrity for the app's overlays (add dialog, scan dialog, edit panel,
// delete confirmation).
//
// One overlay session owns focus, inert page regions, scroll lock, Escape,
// backdrop clicks, listener cleanup, and focus restoration. Overlays nest: a
// confirmation can open over an edit panel and the panel resumes afterwards.
// Scope is exactly the app's own regions — the impeccable live bar and other
// body-level guests stay interactive.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const APP_REGIONS = ['.app-header', 'main', '.app-footer'];

/** @type {Array<{root: HTMLElement, onClose: (() => void) | null, opener: HTMLElement | null, onTab: (event: KeyboardEvent) => void, onEscape: (event: KeyboardEvent) => void, onClick: (event: MouseEvent) => void, closed: boolean}>} */
const stack = [];
let inertedRegions = [];

/**
 * Activate an overlay session.
 *
 * @param {HTMLElement} root overlay element (must be outside the app regions)
 * @param {{onClose?: () => void}} [options] called for Escape and backdrop
 * @returns {{close: () => void, root: HTMLElement}}
 */
export function activateOverlay(root, { onClose = null } = {}) {
  const previous = stack[stack.length - 1] || null;

  if (previous) {
    previous.root.inert = true;
  } else {
    for (const selector of APP_REGIONS) {
      const element = document.querySelector(selector);
      if (element && !element.inert) {
        element.inert = true;
        inertedRegions.push(element);
      }
    }
    document.body.classList.add('overlay-open');
  }

  const entry = {
    root,
    onClose,
    opener: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    onTab: () => {},
    onEscape: () => {},
    onClick: () => {},
    closed: false,
  };

  const focusable = () =>
    Array.from(root.querySelectorAll(FOCUSABLE)).filter(
      (element) => element.offsetParent !== null || element === document.activeElement,
    );

  entry.onTab = (event) => {
    if (event.key !== 'Tab' || stack[stack.length - 1] !== entry) return;
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

  entry.onEscape = (event) => {
    if (
      event.key !== 'Escape' ||
      event.defaultPrevented ||
      stack[stack.length - 1] !== entry
    ) {
      return;
    }
    event.preventDefault();
    if (entry.onClose) entry.onClose();
    else closeOverlay(entry);
  };

  entry.onClick = (event) => {
    if (event.target !== root || stack[stack.length - 1] !== entry) return;
    if (entry.onClose) entry.onClose();
    else closeOverlay(entry);
  };

  document.addEventListener('keydown', entry.onTab, true);
  document.addEventListener('keydown', entry.onEscape);
  root.addEventListener('click', entry.onClick);
  stack.push(entry);

  if (!root.hasAttribute('tabindex')) {
    root.setAttribute('tabindex', '-1');
  }
  const initial = root.querySelector('[data-autofocus]') || focusable()[0] || root;
  window.requestAnimationFrame(() => initial.focus?.());

  return {
    close: () => closeOverlay(entry),
    root,
  };
}

function closeOverlay(entry) {
  if (entry.closed) return;
  entry.closed = true;

  const index = stack.indexOf(entry);
  if (index !== -1) stack.splice(index, 1);

  document.removeEventListener('keydown', entry.onTab, true);
  document.removeEventListener('keydown', entry.onEscape);
  entry.root.removeEventListener('click', entry.onClick);
  entry.root.inert = false;

  const previous = stack[stack.length - 1] || null;
  if (previous) {
    previous.root.inert = false;
    if (entry.opener?.isConnected) entry.opener.focus?.();
    return;
  }

  for (const element of inertedRegions) element.inert = false;
  inertedRegions = [];
  document.body.classList.remove('overlay-open');

  if (entry.opener?.isConnected) entry.opener.focus?.();
}
