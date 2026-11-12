import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveIconUrl } from '../../assets/js/icon-urls.js';

// The same three URLs are pinned in `src/icons.rs`
// (test_cdn_templates_match_frontend_chain), so changing one implementation
// without the other fails a suite.

test('a slug expands to the Dashboard Icons, Simple Icons, selfh.st chain', () => {
  assert.deepEqual(resolveIconUrl({ icon: 'plex', name: 'Plex' }), {
    src: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/plex.svg',
    fallback: [
      'https://cdn.simpleicons.org/plex',
      'https://cdn.jsdelivr.net/gh/selfhst/icons@master/svg/plex.svg',
    ],
  });
});

test('a missing icon slug falls back to the service name', () => {
  const { src, fallback } = resolveIconUrl({ name: 'Home Assistant' });
  assert.equal(
    src,
    'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/home-assistant.svg',
  );
  assert.equal(fallback[0], 'https://cdn.simpleicons.org/home-assistant');
});

test('an absolute icon URL is used as-is without fallbacks', () => {
  assert.deepEqual(resolveIconUrl({ icon: 'https://example.com/icon.png', name: 'Custom' }), {
    src: 'https://example.com/icon.png',
    fallback: [],
  });
});
