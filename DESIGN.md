---
name: Strandgut
description: LAN service scanner dashboard — flotsam on the night tide, collected on glass.
colors:
  tide-amber: "#f4a340"
  tide-amber-hover: "#f5b04a"
  deep-water-navy: "#0a1628"
  glass-surface: "rgba(232, 224, 216, 0.07)"
  glass-surface-hover: "rgba(232, 224, 216, 0.12)"
  raised-surface: "rgba(13, 28, 38, 0.9)"
  header-veil: "rgba(10, 22, 40, 0.55)"
  beach-bone: "#e8e0d8"
  driftwood-grey: "#8b8078"
  kelp-green: "#6baf92"
  weathered-terracotta: "#c4746e"
  hairline: "rgba(255, 255, 255, 0.12)"
typography:
  display:
    fontFamily: "'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 650
    letterSpacing: "0.01em"
  headline:
    fontFamily: "'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
  title:
    fontFamily: "'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
  body:
    fontFamily: "'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
  label:
    fontFamily: "'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
rounded:
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "28px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "8": "2rem"
  "12": "3rem"
components:
  button-primary:
    backgroundColor: "{colors.tide-amber}"
    textColor: "{colors.deep-water-navy}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1.25rem"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.tide-amber-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.driftwood-grey}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1.25rem"
    height: "44px"
  card:
    backgroundColor: "{colors.glass-surface}"
    rounded: "{rounded.lg}"
    padding: "1rem"
    size: "160px"
  input-text:
    backgroundColor: "{colors.glass-surface}"
    textColor: "{colors.beach-bone}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1rem"
  pill-switch:
    rounded: "{rounded.xl}"
    height: "44px"
  nav-header:
    backgroundColor: "{colors.header-veil}"
    textColor: "{colors.beach-bone}"
    padding: "0.75rem 1.5rem"
---

# Design System: Strandgut

## Overview

**Creative North Star: "Gut der Nachtflut" — Flotsam on the Night Tide**

The network is dark water; Strandgut is what the night tide leaves on the shore. The canvas is deep
water navy, the tiles are panes of tinted glass, and a single amber lamp — the same lamp that burns
in a beachcomber's window — marks everything you can touch: buttons, the active switch, focus
rings, the running scan. Nothing else glows.

The voice is a quiet maritime workshop: weathered, warm-utilitarian, unhurried. Surfaces are
translucent layers of beach bone over the photographic ground, so the sea light is always faintly
present behind the work. The decay of the metaphor is deliberate: this is a working instrument for
finding and reaching services, so density stays low, labels stay factual, and the charm lives in
copy and material — "Nothing washed ashore yet" — never in ornament.

**Key Characteristics:**

- Deep water navy ground, beach-bone text, one amber voice.
- Depth from layered translucency (glass), not from stacked shadows.
- Tactile and quiet: panes you can press, presses you can feel.
- Square service tiles on a centered auto-fit grid; everything else is a hairline-bordered pane.
- Motion is short, purposeful, and settles — one deliberate bounce, everywhere else smooth decay.

## Colors

A twilight palette: two neutrals carry the room, one amber carries the attention, and status hues
appear only when a state earns them.

### Primary

- **Tide Amber** (#f4a340): the single interactive voice. Primary buttons, the checked pill-switch
  track and thumb, focus rings, the indeterminate scan progress bar, drag-target emphasis. Hover
  lightens to a touch more sun (**Tide Amber Hover**, #f5b04a).
- **Amber Halo** (rgba(244, 163, 64, 0.4)): the box-shadow glow under a hovered primary button —
  the lamp's spill, used at glow strength only, never as a fill.
- **Amber Ring** (rgba(244, 163, 64, 0.3)): the 3px focus halo on text inputs.

### Neutral

- **Deep Water Navy** (#0a1628): the base canvas under everything; also the text color on amber
  fills, so the lamp never writes in white.
- **Beach Bone** (#e8e0d8): primary text; and as **Glass Surface** (rgba(232, 224, 216, 0.07)) and
  **Glass Surface Hover** (rgba(232, 224, 216, 0.12)) the material of every pane and tile — never
  a solid grey.
- **Raised Surface** (rgba(13, 28, 38, 0.9)): the darker glass of dialogs and the edit panel,
  blurred over the page behind them.
- **Header Veil** (rgba(10, 22, 40, 0.55)): the sticky header's translucent navy.
- **Driftwood Grey** (#8b8078): secondary text — meta lines, labels, inactive switch text, the
  photo credit.
- **Hairline** (rgba(255, 255, 255, 0.12)): the 1px border on every glass edge; dividers inside
  dialogs use it too.

### Status (theme-invariant)

- **Kelp Green** (#6baf92): reachable/success states (dot, status chip on rgba(107, 175, 146, 0.15)).
- **Weathered Terracotta** (#c4746e): errors and danger (invalid field, error chip on
  rgba(196, 116, 110, 0.15)).

### Named Rules

**The One Lamp Rule.** Amber marks only what is actionable or active — buttons, focus, the checked
switch, scan progress, drag targets. It never decorates: no amber headings, borders, or icons at
rest.

**The Tinted Glass Rule.** Surfaces are beach-bone translucency over the ground (7% at rest, 12%
hovered), never opaque grey fills; the photographic ground must stay faintly visible through them.

**The Status Earns Color Rule.** Kelp green and terracotta appear only where a real state exists
(reachable, error). They are never used for emphasis, branding, or decoration.

**The One Canvas Rule.** The painted page background is the token value
(`--color-surface-canvas`); there is exactly one night blue. A second hardcoded navy under the
photo drifts from the palette and silently changes every contrast calculation.

## Typography

**Display Font:** Hanken Grotesk (with system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif)
**Body Font:** Hanken Grotesk (same stack)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)

**Character:** A warm humanist grotesque does all the talking — brand, headings, buttons, body —
while JetBrains Mono steps in only as the recording hand: addresses, ports, sources, credits.
Both are self-hosted woff2 files shipped inside the binary.

### Hierarchy

- **Display** (650, 1.125rem, letter-spacing 0.01em): the "Strandgut" wordmark next to the 36px
  logo; also h3-scale content; never used for page headings.
- **Headline** (600, 1.375rem): page-scale headings — onboarding and empty-state titles.
- **Title** (600, 1.25rem): dialog and panel headings, and the 36px close glyphs.
- **Body** (400, 1rem, line-height 1.5): document text; onboarding copy caps at 40ch.
- **Control** (500, 0.9375rem): buttons, inputs, dialog options, list content.
- **Label** (500, 0.875rem): form labels, fieldset legends, switch text, tile titles (tile titles
  are 600 at 0.875rem, 0.9375rem with 2-line clamp on mobile).
- **Mono** (400, 0.8125rem): scan-result metadata, port addresses, picker source names, the footer
  credit.

### Named Rules

**The Two-Voice Rule.** Grotesk speaks, Mono records. Anything a user reads as prose is Hanken
Grotesk; anything that is an address, number, identifier, or provenance goes JetBrains Mono.

**The One Step Rule.** Headings move in one step from body (1.25rem vs 1rem); hierarchy comes from
weight and spacing, not from a size ladder. There is no display-size headline in this system —
1.375rem is the largest text on any screen.

## Layout

A centered find-shelf. The main grid is `repeat(auto-fit, 160px)` with `justify-content: center`
and a 0.75rem gap — square tiles that never stretch; leftover space stays at the edges, not inside
the tiles. Padding is 1rem top / 1.5rem sides / 2rem bottom.

The sticky header (top: 0, z-index 100) is a 20px-blurred veil, 0.75rem/1.5rem padding, closed by
a 1px hairline; the footer mirrors it with 1.5rem padding, secondary text, and a mono credit line.

Onboarding and empty states are a centered column: 64px logo mark at 95% opacity, title, a 40ch
paragraph, then the action row — carried by a *reading pane* (tinted glass, hairline, 20px radius,
blurred 20px, max-width 34rem) instead of sitting on bare photograph. The footer mirrors the header
as a navy veil (`--color-header-bg`, 20px blur, hairline top edge) so its credit never lands on the
photo either.

**The Reading Surface Rule.** Copy that sits on the photographic ground gets its own surface: a
tinted-glass pane, or the header/footer veil. Never rely on the global photo scrim to make text
legible — the ground can be bright, and `background_rotate` can swap it at any time.

Responsive behavior:

- **≤ 599px**: 2 fixed columns (1fr each), 0.75rem gap, header/footer/grid take
  `max(1rem, env(safe-area-inset-*))` side padding, buttons grow to 48px min-height, tile titles
  wrap to 2 clamped lines, the pill switch hides its text and keeps its icon labels.
- **600–899px**: 2 fixed columns; otherwise desktop rules.
- **≥ 900px**: the auto-fit 160px shelf with centered justification.

## Elevation & Depth

Layered glass, not stacked shadows. Depth is material: translucent beach-bone panes sit over a
darkened beach photograph, blurred at 20px (header), 24px (dialogs,
`blur(24px) saturate(160%)`), 16px (edit panel), 20px saturate 160% (tiles). Shadows exist only for
things that genuinely float or lift — dialogs, hovered tiles, pressed buttons. There is no resting
elevation on the grid; a tile at rest is a pane of glass, not a raised card.

### Shadow Vocabulary

- **Glass pane** (`box-shadow: 0 12px 40px -8px rgba(0, 8, 16, 0.5)`): dialogs and the edit panel
  floating over the page.
- **Tile lift** (`box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 16px 48px -8px rgba(0, 8, 16, 0.6)`):
  a hovered service tile; pairs with `translateY(-2px)`.
- **Button rest** (`box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25)`): the small seat under buttons;
  ghost buttons carry none.
- **Top light** (`inset 0 1px 0 rgba(255, 255, 255, 0.1)`): the 1px inner highlight on every glass
  edge — the sea light from above; present on tiles, the edit panel, and the checked switch thumb.

### Named Rules

**The Glass Panes Rule.** Depth is translucency plus blur; a surface that needs a drop shadow to
be seen is drawn wrong. Shadows are reserved for floating panes and hover lift.

**The Light From Above Rule.** Every glass edge carries its inset top highlight; never simulate
light from below or the sides.

## Shapes

Form language: soft panes, square finds, one pill.

- Radii: 8px small (icon previews, progress track), 12px medium (buttons, inputs, result cards,
  fieldsets), 20px large (tiles, dialogs, edit panel), 28px extra-large (the pill switch).
- Service tiles are strict squares (`aspect-ratio: 1 / 1`, 160px grid column) with a 20px radius —
  the square is what makes a scan result read as a found object rather than a card.
- Borders are always 1px hairlines; nothing uses 2px strokes. Emphasis rings (focus, drag-over) are
  2px outlines with 2–3px offset, never fills.
- Circular elements are reserved for state dots (8px reachability), the single-label switch thumb,
  and the 36px round close buttons.

### Named Rules

**The Square Find Rule.** A service always lands as a square; its icon scales inside, the tile
never changes aspect to fit content.

## Components

Tactile and quiet: panes you can press, presses you can feel, surfaces that stay calm between
interactions.

### Buttons

- **Shape:** 12px radius (var(--radius-md)), 44px min-height (48px on mobile), 0.75rem/1.25rem
  padding, 500 weight at 0.9375rem.
- **Primary:** Tide Amber fill, Deep Water Navy text; hover lightens to #f5b04a and lifts the glow
  to `0 4px 12px rgba(244, 163, 64, 0.4)`; press scales to 0.97.
- **Secondary:** glass surface fill with a hairline border; hover steps the fill to 12% glass.
- **Ghost:** transparent, driftwood text (chrome-icons weight); hover raises text to beach bone on
  a 7% glass fill. On a reading pane the ghost action rests at beach bone already — driftwood on
  glass measures 4.1:1, below AA for text.
- **Focus (all):** 2px Tide Amber outline, 2px offset.

### Pill Switch (View / Edit)

The signature control: a 28px-radius pill, 44px tall, with the thumb as a solid amber pane in the
checked state and `translateX(100%)` on toggle. This is the only place in the system where motion
bounces (`0.3s cubic-bezier(0.34, 1.56, 0.64, 1)`); the thumb settles like a latch. A compact
single-label variant (44×24px track, 20px circular thumb) serves toggle rows.

### Service Tiles

Glass panes, 1:1, 20px radius, centered icon (scaled to fit, `object-fit: contain`, 8px radius) over
a single-line title. Hover lifts `translateY(-2px)`, deepens the glass to 12%, and scales the icon
to 1.04. Entrance: `wash-ashore` (opacity + `translateY(16px)` + scale 0.985 → settled, 0.3s
`cubic-bezier(0.2, 0.8, 0.3, 1)`) staggered on first visit only — never on re-renders.

**Title scrim.** The bottom 42% of every tile carries a bottom-weighted inner scrim
(`linear-gradient(to top, rgba(6, 14, 26, 0.62), transparent)`, inset 1px, tile radius) so titles
stay at AA over the bright bands of the photograph without raising the tile's overall opacity.

**Status dot.** A reachability dot sits in the tile's top-right corner (8px circle, `--space-2`
inset): Kelp Green when the page-load check found the service answering, Weathered Terracotta when
it did not, invisible while the check is pending. Reachability is checked once per page load — the
dot is never polled, refreshed, or animated — and it always carries its meaning as text
(`title` + `aria-label`), never as colour alone.

### Dialogs

Raised-surface glass (90% navy), 24px blur saturate 160%, 1px hairline, 20px radius, glass-pane
shadow; 400px (add), 480px (edit), 560px max-height 85vh (scan). Headers and footers are divided by
hairlines. Entrance: `dialog-in` (8px rise + 0.98 scale, 0.24s
`cubic-bezier(0.2, 0.8, 0.3, 1)`).

### Inputs / Fields

7% glass fill, 1px hairline, 12px radius, 0.75rem/1rem padding, beach-bone text; focus replaces the
border with Tide Amber and adds the 3px `rgba(244, 163, 64, 0.3)` halo. Errors switch the border to
Weathered Terracotta with a 0.8125rem message beneath. Radios use `accent-color: var(--color-accent)`.

### Navigation

The header: 36px logo, 1.125rem/650 wordmark, right-aligned actions (add button, View/Edit pill).
Sticky, veiled in Header Navy at 55% with a 20px blur; the only always-visible chrome in the app.

### Overlays (Add, Scan, Edit)

Every overlay is modal for real: focus moves to its declared first control on open, Tab cycles
inside it, the page behind goes `inert` and stops scrolling, and closing returns focus to the
control that opened it. A running scan is never discarded silently — closing it asks inside the
dialog itself ("Keep scanning" / "Close anyway"), matching the system's own control language rather
than a native `confirm()`.

Failure surfaces are part of the system too: a broken backend renders a `.load-error` pane (danger
hairline, beach-bone copy, retry) instead of pretending the shore is empty, and a failed auto-save
raises a persistent `.save-banner` (raised glass, danger hairline, retry) instead of a native
`alert`.

### Named Rules

**The One Bounce Rule.** The pill-switch thumb is the single legitimate bounce in the system
(`--transition-bounce`, tokens.css). Every other transition decays smoothly
(`0.25s cubic-bezier(0.4, 0, 0.2, 1)`).

**The Keep It Short Rule.** Motion is ≤ 0.3s and animates only transform, opacity, and
(color) background — never layout properties; the only exception is the scan bar's box-shadow-free
`indeterminate` drift.

## Do's and Don'ts

### Do:

- **Do** keep the canvas Deep Water Navy (#0a1628) and text Beach Bone (#e8e0d8); every new pane is
  a translucency of the same bone, not a new grey.
- **Do** hold amber to interactive and active states (The One Lamp Rule), including focus rings
  (2px, offset 2–3px) on every control.
- **Do** build service entries as square tiles on the auto-fit 160px shelf; let the icon scale, not
  the tile.
- **Do** put addresses, ports, identifiers, and credits in JetBrains Mono at 0.8125rem.
- **Do** keep motion ≤ 0.3s on transform/opacity, with `wash-ashore` reserved for first paint and
  `prefers-reduced-motion` respected.
- **Do** respect the accessibility fallbacks that exist: forced-colors, reduced-transparency
  (glass degrades to solid navy), and print (light-on-white) modes.
- **Do** give text on the photograph its own pane or veil (The Reading Surface Rule) and keep every
  text/ground pair at AA or better — verify it, don't eyeball it.

### Don't:

- **Don't** fill surfaces with opaque greys or remove the backdrop blur without the
  reduced-transparency fallback — the ground should stay faintly present.
- **Don't** add resting drop shadows to tiles; they are glass at rest, and only lift on hover.
- **Don't** use bounce or elastic easing anywhere but the pill-switch thumb (The One Bounce Rule).
- **Don't** tint headings, borders, or icons in Tide Amber; if it is not actionable or active, it
  is neutral.
- **Don't** introduce a display-size headline or a third type family; hierarchy comes from weight
  and spacing (The One Step Rule).
- **Don't** use Kelp Green or Terracotta for anything without a reachable/error meaning.
- **Don't** introduce a second canvas colour or place body copy straight on the photo ground.
