import { toggleEditMode, isEditing } from './state.js';

const switchEl = document.getElementById('pill-switch');

function updateSwitchUI() {
  if (!switchEl) return;
  const isOn = isEditing();
  switchEl.setAttribute('aria-checked', String(isOn));
}

function handleClick() {
  toggleEditMode();
}

function init() {
  if (!switchEl) return;
  updateSwitchUI();
  switchEl.addEventListener('click', handleClick);
  window.addEventListener('editmodechange', updateSwitchUI);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
