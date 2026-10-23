// Modal integrity for the app's overlays (add dialog, scan dialog, edit panel,
// delete confirmation).
//
// One overlay session owns focus, inert page regions, scroll lock, Escape,
// backdrop clicks, listener cleanup, and focus restoration. Overlays nest: a
// confirmation can open over an edit panel and the panel resumes afterwards.
// Scope is exactly the app's own regions — body-level guests stay interactive.

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
    inertPage();
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

  installFocusTrap(entry);
  installDismissal(entry);
  document.addEventListener('keydown', entry.onTab, true);
  document.addEventListener('keydown', entry.onEscape);
  root.addEventListener('click', entry.onClick);
  stack.push(entry);
  prepareFocus(entry);

  return {
    close: () => closeOverlay(entry),
    root,
  };
}

function isTop(entry) {
  return stack[stack.length - 1] === entry;
}

function focusableWithin(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

function installFocusTrap(entry) {
  entry.onTab = (event) => {
    if (event.key !== 'Tab' || !isTop(entry)) return;

    const items = focusableWithin(entry.root);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!entry.root.contains(active)) {
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
}

function installDismissal(entry) {
  entry.onEscape = (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !isTop(entry)) return;
    event.preventDefault();
    dismiss(entry);
  };

  entry.onClick = (event) => {
    if (event.target !== entry.root || !isTop(entry)) return;
    dismiss(entry);
  };
}

function dismiss(entry) {
  if (entry.onClose) entry.onClose();
  else closeOverlay(entry);
}

function prepareFocus(entry) {
  if (!entry.root.hasAttribute('tabindex')) {
    entry.root.setAttribute('tabindex', '-1');
  }
  const initial =
    entry.root.querySelector('[data-autofocus]') || focusableWithin(entry.root)[0] || entry.root;
  window.requestAnimationFrame(() => initial.focus?.());
}

function inertPage() {
  for (const selector of APP_REGIONS) {
    const element = document.querySelector(selector);
    if (element && !element.inert) {
      element.inert = true;
      inertedRegions.push(element);
    }
  }
  document.body.classList.add('overlay-open');
}

function restorePage() {
  for (const element of inertedRegions) element.inert = false;
  inertedRegions = [];
  document.body.classList.remove('overlay-open');
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

  restorePage();
  if (entry.opener?.isConnected) entry.opener.focus?.();
}
