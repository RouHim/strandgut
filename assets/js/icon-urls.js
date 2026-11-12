// CDN fallback chain for tile icons.
//
// Kept DOM-free so `node --test` can pin the URLs. The same three CDN bases
// live in `src/icons.rs`; both sides assert the identical URL set in their own
// tests, so changing one implementation without the other fails a suite.

const DASHBOARD_ICONS_CDN = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master';
const SIMPLE_ICONS_CDN = 'https://cdn.simpleicons.org';
const SELFHST_CDN = 'https://cdn.jsdelivr.net/gh/selfhst/icons@master';

/**
 * Resolve an icon URL with the multi-CDN fallback chain.
 *
 * A full URL is used as-is. Anything else is treated as a slug (the icon value
 * or the service name) and expanded into Dashboard Icons, then Simple Icons,
 * then selfh.st.
 *
 * @param {{icon?: string|null, name: string}} service
 * @returns {{src: string, fallback: string[]}}
 */
export function resolveIconUrl(service) {
  const icon = service.icon;
  if (icon && (icon.startsWith('http://') || icon.startsWith('https://'))) {
    return { src: icon, fallback: [] };
  }
  const slug = encodeURIComponent((icon || service.name).toLowerCase().replace(/\s+/g, '-'));
  return {
    src: `${DASHBOARD_ICONS_CDN}/svg/${slug}.svg`,
    fallback: [`${SIMPLE_ICONS_CDN}/${slug}`, `${SELFHST_CDN}/svg/${slug}.svg`],
  };
}
