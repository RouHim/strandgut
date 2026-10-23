import test from 'node:test';
import assert from 'node:assert/strict';

import {
  configureStore,
  addService,
  updateService,
  removeService,
  reorderServices,
  setBackgroundRotate,
  getServices,
  isDirty,
  retrySave,
  subscribe,
  whenIdle,
} from '../../assets/js/store.js';

function makeConfig(services = []) {
  return {
    title: 'Strandgut',
    language: 'en',
    scan_defaults: 'simple',
    services,
    background_rotate: false,
  };
}

function makeService(name) {
  return {
    name,
    url: `http://${name}.local`,
    icon: null,
    description: null,
  };
}

test('loading normalizes positions to array order', () => {
  configureStore({
    initialConfig: makeConfig([
      { ...makeService('alpha'), position: { row: 9, col: 9 } },
      { ...makeService('beta'), position: { row: 3, col: 2 } },
    ]),
    save: async () => {},
  });

  assert.deepEqual(
    getServices().map((service) => service.position),
    [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ],
  );
});

test('adding services assigns positions and notifies once per mutation', async () => {
  const saves = [];
  configureStore({
    initialConfig: makeConfig(),
    save: async (config) => saves.push(structuredClone(config)),
  });
  let notifications = 0;
  subscribe(() => notifications++);

  addService(makeService('alpha'));
  addService(makeService('beta'));
  await whenIdle();

  assert.deepEqual(
    getServices().map((service) => service.position),
    [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ],
  );
  assert.equal(notifications, 2);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].services.length, 2);
});

test('reordering normalizes every position', async () => {
  configureStore({
    initialConfig: makeConfig([
      { ...makeService('alpha'), position: { row: 0, col: 0 } },
      { ...makeService('beta'), position: { row: 0, col: 1 } },
      { ...makeService('gamma'), position: { row: 0, col: 2 } },
    ]),
    save: async () => {},
  });

  reorderServices(0, 2);

  assert.deepEqual(
    getServices().map((service) => service.name),
    ['beta', 'gamma', 'alpha'],
  );
  assert.deepEqual(
    getServices().map((service) => service.position),
    [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ],
  );
});

test('update and remove act on the selected service', async () => {
  configureStore({
    initialConfig: makeConfig([
      { ...makeService('alpha'), position: { row: 0, col: 0 } },
      { ...makeService('beta'), position: { row: 0, col: 1 } },
    ]),
    save: async () => {},
  });

  updateService(1, { ...makeService('beta'), description: 'media' });
  assert.equal(getServices()[1].description, 'media');

  removeService(0);
  assert.deepEqual(
    getServices().map((service) => service.name),
    ['beta'],
  );
  assert.deepEqual(getServices()[0].position, { row: 0, col: 0 });
});

test('rapid mutations serialize saves and snapshot each state', async () => {
  const saves = [];
  let releaseFirst;
  configureStore({
    initialConfig: makeConfig(),
    save: (config) =>
      new Promise((resolve) => {
        saves.push(structuredClone(config));
        if (saves.length === 1) releaseFirst = resolve;
        else resolve();
      }),
  });

  addService(makeService('alpha'));
  await Promise.resolve();
  addService(makeService('beta'));
  releaseFirst();
  await whenIdle();

  assert.equal(saves.length, 2);
  assert.equal(saves[0].services.length, 1);
  assert.equal(saves[1].services.length, 2);
});

test('a failed save keeps the store dirty and retry clears it', async () => {
  let fail = true;
  let errors = 0;
  configureStore({
    initialConfig: makeConfig(),
    save: async () => {
      if (fail) throw new Error('offline');
    },
    onError: () => errors++,
  });

  addService(makeService('alpha'));
  await whenIdle();

  assert.equal(errors, 1);
  assert.equal(isDirty(), true);

  fail = false;
  await retrySave();

  assert.equal(isDirty(), false);
});

test('background rotation only saves when the value changes', async () => {
  const saves = [];
  configureStore({
    initialConfig: makeConfig(),
    save: async (config) => saves.push(structuredClone(config)),
  });
  const changes = [];
  subscribe((change) => changes.push(change));

  setBackgroundRotate(false);
  await whenIdle();
  assert.equal(saves.length, 0);

  setBackgroundRotate(true);
  await whenIdle();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].background_rotate, true);
  assert.deepEqual(changes, [{ servicesChanged: false }]);
});
