/**
 * UI state that is not part of the persisted dashboard config.
 *
 * Services and config live in `store.js`; this module owns edit mode and the
 * page-load reachability map.
 */

let isEditMode = false;

/** url -> reachable, filled once per page load from /api/status. */
let serviceStatuses = new Map();

export function isEditing() {
  return isEditMode;
}

export function toggleEditMode() {
  isEditMode = !isEditMode;
  window.dispatchEvent(new CustomEvent('editmodechange'));
}

/** Statuses come only from the page-load check; a reload is a fresh answer. */
export function setServiceStatuses(list) {
  serviceStatuses = new Map((list || []).map((status) => [status.url, !!status.reachable]));
}

export function getServiceStatus(url) {
  return serviceStatuses.has(url) ? serviceStatuses.get(url) : null;
}
