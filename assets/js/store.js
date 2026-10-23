/**
 * Dashboard configuration store.
 *
 * One owner for the config snapshot, service placement, dirty state, change
 * notification, and serialised persistence. DOM-free: renderers and the
 * persistence adapter are injected by the composition root (`app.js`).
 */

/** Persisted position lattice, not the visual grid width. */
const POSITION_COLUMNS = 4;

let state = freshState();

function freshState() {
  return {
    config: null,
    dirty: false,
    persist: null,
    onError: null,
    onSaved: null,
    listeners: new Set(),
    queue: Promise.resolve(),
  };
}

/**
 * Initialise the store for the loaded config.
 *
 * @param {object} options
 * @param {object} options.initialConfig
 * @param {(config: object) => Promise<void>} [options.save]
 * @param {(error: Error) => void} [options.onError]
 * @param {() => void} [options.onSaved]
 */
export function configureStore({ initialConfig, save, onError, onSaved } = {}) {
  state = freshState();
  state.config = initialConfig || null;
  state.persist = save || null;
  state.onError = onError || null;
  state.onSaved = onSaved || null;
  if (state.config) normalizePositions();
}

export function getConfig() {
  return state.config;
}

export function getServices() {
  return state.config?.services || [];
}

export function isDirty() {
  return state.dirty;
}

/**
 * Subscribe to store changes. Returns an unsubscribe function.
 * @param {() => void} listener
 */
export function subscribe(listener) {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

/** Resolve when the current save queue has drained. */
export function whenIdle() {
  return state.queue;
}

/** Schedule another save after a failure. */
export function retrySave() {
  scheduleSave();
  return state.queue;
}

function notify(change) {
  for (const listener of [...state.listeners]) listener(change);
}

function normalizePositions() {
  const services = getServices();
  services.forEach((service, index) => {
    service.position = {
      row: Math.floor(index / POSITION_COLUMNS),
      col: index % POSITION_COLUMNS,
    };
  });
}

function mutate(change, { servicesChanged = true } = {}) {
  if (!state.config) return;
  change(state.config.services);
  normalizePositions();
  state.dirty = true;
  notify({ servicesChanged });
  scheduleSave();
}

export function addService(service) {
  mutate((services) => services.push(service));
}

export function updateService(index, service) {
  const services = getServices();
  if (index < 0 || index >= services.length) return;
  mutate((list) => {
    list[index] = service;
  });
}

export function removeService(index) {
  const services = getServices();
  if (index < 0 || index >= services.length) return;
  mutate((list) => {
    list.splice(index, 1);
  });
}

export function reorderServices(fromIndex, toIndex) {
  const services = getServices();
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= services.length ||
    toIndex >= services.length
  ) {
    return;
  }
  mutate((list) => {
    const [service] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, service);
  });
}

export function setBackgroundRotate(enabled) {
  const next = Boolean(enabled);
  if (!state.config || state.config.background_rotate === next) return;
  mutate(
    () => {
      state.config.background_rotate = next;
    },
    { servicesChanged: false },
  );
}

function scheduleSave() {
  state.queue = state.queue.then(() => runSave()).catch(() => {});
}

async function runSave() {
  if (!state.persist) return;

  while (state.dirty) {
    const snapshot = structuredClone(state.config);
    state.dirty = false;
    try {
      await state.persist(snapshot);
      state.onSaved?.();
    } catch (error) {
      state.dirty = true;
      state.onError?.(error);
      return;
    }
  }
}
