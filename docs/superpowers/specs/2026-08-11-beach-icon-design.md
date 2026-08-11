# Beach Icon Rebrand: Design Spec

**Date:** 2026-08-11
**Status:** Approved (color treatment chosen by user: brand color swap)

## Context

Strandgut's brand mark is currently a flip-flop icon in a teal circle (`assets/img/logo.svg`),
used as favicon, header brand mark (36px), and onboarding mark (64px). The GitHub banner
(`.github/readme/banner.svg`) embeds the same icon at 128px.

The user wants to replace the icon with a beach scene sourced from SVG Repo
(https://www.svgrepo.com/download/428248/beach.svg), recolored to the Strandgut brand palette.

## Source Asset

`beach.svg` (SVG Repo #428248): a tropical scene in a circle: blue water upper-left,
sand lower-right, palm tree on the right. viewBox `-5 11 100 100`; the background circle
(cx=45, cy=61, r=50) exactly fills the viewBox.

Real artwork is ~1.1KB. The 43KB download is dominated by an embedded Adobe Illustrator
`<i:pgf>` CDATA blob, a DOCTYPE with entity declarations, and a `<switch>`/`<foreignObject>`
wrapper. All of these are stripped; only the artwork `<g>` survives.

## Color Mapping (stock → brand)

Preserves every path and shape; only `fill` values change.

| Stock | Brand | Element |
|---|---|---|
| `#2284E6` | `#306860` | water (background circle): brand teal |
| `#49A1FA` (×5) | `#6FB3A2` | wave strokes: lighter teal |
| `#F2CEA5` | `#E9A95E` | sand base: soft amber |
| `#F9E8D6` | `#F6DFB8` | shoreline foam: cream |
| `#CFB08D` | `#DDB37A` | dune patch: lighter warm tan |
| `#D4B08C` | `#C99B63` | sand dots: warm tan |
| `#B69778` (×2) | `#C9A06B` | sand speckles: subtle tan |
| `#8EBF1D` (×2) | `#7C9E3A` | palm fronds: muted olive |
| `#6B940F` (×2) | `#5E8027` | frond shade |
| `#70A619` | `#62892B` | frond mid |
| `#703741` | `#7A5440` | trunk: lighter warm brown |
| `#5C2D35` | `#634434` | trunk shade |
| `#452228` | `#4A3026` | trunk shadow |

Rationale (validated by visual QA at 300px / 36px / 16px):

- Teal + amber pair naturally (warm/cool contrast reads as ocean/shore).
- Stock greens were muted to olive so the palm does not hijack the palette.
- Trunk was lightened from stock so it does not merge into the dark sand patch.
- The dune patch was lightened so the trunk base boundary stays visible.
- At 16px the mark degrades to a teal/amber/olive glyph: accepted; the current flip-flop
  degrades similarly.

## File Changes

| File | Change |
|---|---|
| `assets/img/logo.svg` | Replace flip-flop artwork with the cleaned, brand-swapped beach icon |
| `.github/readme/banner.svg` | Replace embedded icon group with beach icon at same footprint (~128px), recenter glow, add `xmlns:xlink` |

Explicitly **not** changed:

- `assets/img/background.webp`: page background photo, not an icon
- `assets/index.html`, `assets/css/*`, `src/spa.rs`: logo path and embeds are unchanged;
  only the file content at the same path changes
- e2e specs: no test references the logo (verified by search)

## Banner Layout

- Icon group: `translate(52, 25) scale(1.28)`: 100-unit art → 128px. Rendered left edge is
  45.6 (beach viewBox starts at x=-5, so 52 + (-5 × 1.28)), 6.4px left of the previous
  icon's left edge at 52. Vertical offset 25 (not 36) centers the beach
  circle (center y=61) on the text block (visual center ~103).
- Glow circle: `<circle cx="45" cy="61" r="70" fill="rgba(244,163,64,0.04)" filter="url(#icon-glow)"/>`
 : amber halo retained; follows the beach circle center.
- Typography, accent bar, gradients, noise: untouched.

## Verification

- Both SVGs render without XML errors (`rsvg-convert`).
- `cargo test` and `cargo clippy -- -D warnings` pass (assets embedded via `include_bytes!`).
- Browser smoke test: header shows the beach mark at 36px, favicon loads, onboarding mark at 64px.
