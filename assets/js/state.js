let config = null;
let isDirty = false;
let isEditMode = false;

/** Number of columns in the service grid (matches layout.css). */
export const GRID_COLUMNS = 4;

export function getConfig() {
  return config;
}

export function setConfig(newConfig) {
  config = newConfig;
  isDirty = true;
}

export function isConfigDirty() {
  return isDirty;
}

export function markClean() {
  isDirty = false;
}

export function isEditing() {
  return isEditMode;
}

export function toggleEditMode() {
  isEditMode = !isEditMode;
  window.dispatchEvent(new CustomEvent('editmodechange'));
}

export function getServices() {
  return config?.services || [];
}

export function addService(service) {
  const idx = config.services.length;
  service.position = { row: Math.floor(idx / GRID_COLUMNS), col: idx % GRID_COLUMNS };
  config.services.push(service);
  isDirty = true;
  window.dispatchEvent(new CustomEvent('configchanged'));
}

export function updateService(index, service) {
  config.services[index] = service;
  isDirty = true;
  window.dispatchEvent(new CustomEvent('configchanged'));
}

export function removeService(index) {
  config.services.splice(index, 1);
  isDirty = true;
  window.dispatchEvent(new CustomEvent('configchanged'));
}

export function reorderServices(fromIndex, toIndex) {
  const [service] = config.services.splice(fromIndex, 1);
  config.services.splice(toIndex, 0, service);
  config.services.forEach((svc, i) => {
    svc.position = { row: Math.floor(i / GRID_COLUMNS), col: i % GRID_COLUMNS };
  });
  isDirty = true;
  window.dispatchEvent(new CustomEvent('configchanged'));
}
