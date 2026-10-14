---
target: dashboard (assets/index.html)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
target_identity: "file:assets/index.html"
target_fingerprint: "sha256:47ffddb74b125c6aad9aa930a492764b37eac401a3b084ab072abfe664b5a8cb"
target_path: assets/index.html
timestamp: 2026-10-14T15-01-51Z
slug: assets-index-html
---
# Critique: Strandgut dashboard (`assets/index.html`)

Method: dual-agent (A: CritiqueA · B: CritiqueB)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Scan progress and result "Added" state are good; but saving is fully silent (every edit PUTs `config.toml`, `app.js:77-86`), a deep scan shows only "Scanning…" with no port count/ETA (`scan.js:180`), and the dashboard never reflects a running scan or a service's liveness though the API returns `reachable` (`scan.js:297`) |
| 2 | Match System / Real World | 3 | Plain maritime voice, mono for `host:port`; but one concept has three names (README quick/thorough/exhaustive vs UI Simple/Medium/Deep vs config `simple|medium|deep`, `scan.js:33-45`), "Deep" carries no duration expectation, and an address is only visible inside the edit form |
| 3 | User Control and Freedom | 2 | Esc/backdrop/Cancel exist, but closing the scan dialog silently aborts a running scan and discards results (`scan.js:368-372`), there is no Stop, delete has no undo (`edit.js:310-319`) |
| 4 | Consistency and Standards | 2 | Visual system is strong; behaviour isn't: native `confirm()` for delete (`edit.js:315`), modal chooser vs side panel for the two add paths, mixed-language German UI, "Tap Add…" copy on desktop (`en.js`) |
| 5 | Error Prevention | 2 | Required fields and URL pattern enforced (`edit.js:281-286`), duplicate scan hits pre-disabled; but errors are invisible, a running scan is unprotected, and the irreversible `config.toml` write has no ceremony |
| 6 | Recognition Rather Than Recall | 2 | Icon-only controls (add, pencil, trash), no drag affordance in edit mode (`drag.js:22-30`), scan depth/ports unexplained, truncated tile names have no `title` (verified `scrollWidth 285 > clientWidth 126`) |
| 7 | Flexibility and Efficiency | 1 | No keyboard accelerators beyond Esc and picker arrows; reorder is HTML5 drag only — not keyboard- and not touch-operable (`grid.js:51,102`); no search/filter at 30+ tiles; Enter in the Name field does nothing (Save is `type="button"`, `edit.js:181-192`) |
| 8 | Aesthetic and Minimalist Design | 3 | Genuinely restrained; deductions: duplicate name line on scan result cards (`scan.js:301-309`), three exits plus a stale "Start Scan" primary in the finished scan footer, permanent footer credit, icon dropdown ghosts the form text through it (`crop-picker.png`) |
| 9 | Error Recovery | 1 | Validation text never renders (cascade bug, `components.css:783-792`); save failure = raw `alert(err.message)` (`app.js:84`); failed config load renders the "Nothing washed ashore yet" onboarding (`app.js:115-117`); unresolvable host is indistinguishable from "No services found" (`scan-error.png`) |
| 10 | Help and Documentation | 2 | Good README, unreachable from the UI; in-app help is placeholder text plus one `title="Reachable"`; no explanation of depths, ports, or icon slugs |
| **Total** | | **20/40** | **Acceptable, lower edge (50%)** |

`n/a`: none — all ten heuristics apply to an Operate surface.

## Design Specificity Verdict

**The visual language is authored for this product; the composition, IA and interaction are
category-interchangeable — and they demote the product's two differentiators. Specificity is high in the
paint, low in the plan.**

**LLM assessment (A).** Authored and holding up: the one-lamp/glass/find-shelf material system (amber only on
actionable and active things — verified in `focus.png`, `edit-desktop.png`, `mobile-scan-results.png`), the
View/Edit pill latch as a single legible mode control (`index.html:36-71`, `tokens.css:46`), square found-object
tiles (`components.css:205-227`), and the wash-ashore stagger plus maritime copy. Interchangeable: the skeleton
is any launcher grid (logo + add + mode switch ▸ icon tiles ▸ footer credit); the flagship scanner sits three
taps deep inside a generic "Add Service" chooser (`index.html:63-75`, `add-dialog.js:21-45`); scan results never
reach the dashboard although README:14 promises "live results" (`scan.js:302-321`); the dashboard never shows
liveness — no reachability dot on tiles (`grid.js:74-99`) even though PRODUCT.md defines success as "see what is
running"; and the scan-depth naming contradicts the README.

**Deterministic scan (B).** CLI (`detect --json assets/`): exit 0 — **0 anti-patterns, 24 advisories**, all from
the design-system family: `design-system-color` (`themes.css:17,18,48,52,58,62,80,86,91,166,183`;
`components.css:182,196`; `index.html`), `design-system-font-size`
(`components.css:372,386,435,713,854`, `layout.css:104`, `reset.css:22,34,35`), `design-system-radius`
(`components.css:843`). In-page injection (`detect.js`, desktop+mobile, reproducible, with a no-injection control
run): **1 anti-pattern — `low-contrast 3.1:1 (need 4.5:1) — text #6f6766 on #1a1a2e`**, targeting the footer
credit `.photo-credit` (`layout.css:102`, `--color-text-secondary` at `opacity:.75`). That is an independent
confirmation of A's pixel-probe finding (A measured ≈2.3–2.6:1 on the same element) and it exposes the real
painted canvas: `#1a1a2e` (`themes.css:17`) — not the token `--color-surface-canvas #0a1628`. Both assessments
converge on the same drift from opposite directions.

**False positives.** `index.html` "text color rgb(0,0,0) on span Strandgut" — `.brand-text` gets
`var(--color-text-primary)` (`layout.css:49`), the static scan cannot resolve the custom property (this was the
one advisory on the changed-files scan too). `themes.css:183` `#0000ee` and `:166` `#ccc` live inside the
`@media print` block by intent. `themes.css:18,48,52,91` are deliberate darkening scrims over the photo.
`components.css:182,196` `rgba(0,0,0,0.3)` are shadow alphas (documented shadow vocabulary; at most 0.25 vs 0.3
trivia).

**Visual overlays.** Injection succeeded and the detector ran in-page — but in the headless evidence browser
(no browser host was connected in this session), so there is **no user-visible `[Human]` overlay** to point at.
Everything reproducible is in the console output above and in `/tmp/crit-B/shot-*.png`.

## Overall Impression

This is a well-crafted launcher whose own flagship capability is hidden from it. The material system survives
every state; the information architecture does not use it. An experienced homelab operator would recognise the
craft immediately and the tool not at all: nothing on the dashboard says "this thing found your services", and
the one moment built for this product — an empty shore filling up while the net is out — happens inside a
scrolling modal. The biggest opportunity is not more polish; it is putting the scan on the page and putting
liveness on the tiles.

## What's Working

1. **Material and lamp discipline survive every state** — amber appears only on the primary button, the 2px
   focus ring, the checked pill thumb, the progress bar; status colours only for real state. Twelve translucent
   hairline tiles with no resting shadow read as one calm shelf (`components.css:205-227`).
2. **The View/Edit pill switch is a genuinely good control** — one legible mode state (`aria-checked` + amber
   thumb), icon-only 96×44 on mobile, the single deliberate bounce in the system (`tokens.css:46`).
3. **The metaphor is carried by motion and copy, not ornament** — wash-ashore stagger on first paint only
   (`grid.js:55-59`), "Nothing washed ashore yet" with its idiomatic German twin, mono reserved for addresses
   and provenance.

## Priority Issues

### [P0] The add dialog is modal in name only — focus never enters it and is never trapped
- **What:** `openAddDialog()` creates `div[role=dialog][aria-modal=true]` and never calls `focus()`
  (`add-dialog.js:7-20`; the only `focus()` calls in the app are `scan.js:96`, `edit.js:202`, icon picker).
  Verified in Chromium: after clicking the header "+", `document.activeElement` is still the add button *behind*
  the overlay, and the next three Tabs reach `edit-toggle`, tile Truenas, tile Music Assistant. None of the
  three overlays traps Tab (`add-dialog.js:48-52`, `scan.js:98-106`, `edit.js:250-258`) or restores focus.
- **Why it matters:** `aria-modal="true"` tells assistive tech the page behind is inert while keyboard focus
  walks into it; the main add path — the one the onboarding CTA launches — is the one with no initial focus.
- **Fix:** focus the dialog on open, trap Tab/Shift-Tab, mark the page behind `inert`, restore focus on close;
  prefer native `<dialog>`+`showModal()` for all three overlays and `aria-labelledby` instead of a bare
  `aria-label`. Suggested command: `$impeccable harden`

### [P1] Error handling is invisible, raw, or lying
- **What:** (1) Field errors never render: `.error-msg--visible{display:block}` (`components.css:783-785`) is
  declared before `.error-msg{display:none}` (`components.css:787-792`) at equal specificity, so `display:none`
  wins — live: Save with empty fields paints terracotta borders and no text while `textContent` holds "Name is
  required." (`edit-panel-errors.png`). (2) A failed config load is disguised as an empty install
  (`app.js:115-117` swallows into `console.error`; onboarding is already visible in markup). (3) Save failures
  surface as `alert(err.message)` → "Failed to save config: 500: …" (`app.js:77-86`). (4) An unresolvable host
  scans to "No services found", indistinguishable from an empty target (`scan-error.png`).
- **Why it matters:** heuristic 9 is the floor of the score; a user who cannot tell "empty", "broken" and "wrong
  address" apart cannot self-serve at the flagship flow.
- **Fix:** fix the cascade (or scope `.error-msg.error-msg--visible`); a real load-error state with retry;
  an inline persistent banner instead of `alert()`; distinct DNS/host failure messaging; validation beside the
  field. Suggested command: `$impeccable polish`

### [P1] The flagship scan is buried, un-reassured, and its payoff never reaches the dashboard
- **What:** three taps deep behind an icon-only "+" (Add ▸ Scan Network ▸ Start Scan) while onboarding leads
  with "Add"; a deep scan (65,535 ports) runs behind an indeterminate bar with no counter/ETA/Stop
  (`scan.js:180`, markup `scan.js:50-56`); closing the dialog silently aborts and discards results
  (`scan.js:368-372`); results only exist inside the modal (`scan.js:302-321`), contradicting README:14; after
  completion the amber primary is still "Start Scan" (`scan.js:246-248`).
- **Why it matters:** this is the one screen only this product could have, and the payoff the visual system was
  built for is spent in a 560px scrolling box. Strip the scan and this is a bookmark launcher.
- **Fix:** scanning as a first-class surface — labelled header affordance, onboarding primary "Scan your
  network", progress and incoming services rendered *on the grid* (tiles washing ashore at their final
  positions), ETA/port counter and a real Stop, warn before closing an active scan, and finish with "Add all
  found" as the primary. Suggested command: `$impeccable shape`

### [P1] Text on the photograph ground fails contrast — and the ground rotates
- **What:** A's pixel probes: empty-state paragraph ≈1.5–1.8:1, onboarding subtitle ≈1.6–2.2:1, footer credit
  ≈2.3–2.6:1, tile titles 6.6–9.4:1 over dark photo areas but 3.5–3.9:1 over the bright top-left. B's in-page
  detector reproduces the footer credit at **3.1:1 (need 4.5:1), #6f6766 on #1a1a2e**. Root cause: every
  paragraph inherits `--color-text-secondary` (`reset.css:38-40`), the ground is a flat 50% scrim over a photo
  (`themes.css:47-52`), glass is 7% white (`tokens.css:66`) — and `background_rotate` swaps in arbitrary remote
  photos on a timer (`background.js:6,78-90`), so the failure is by design able to get worse. Side finding:
  the painted canvas is `#1a1a2e` (`themes.css:17`), not the token `#0a1628` (`tokens.css:47`) — two night
  blues in one system.
- **Why it matters:** the failures sit on the first two screens a new user sees; 4.5:1 is the AA floor for this
  type size.
- **Fix:** give reading surfaces their own pane or a localised scrim instead of relying on the global scrim;
  raise tile glass alpha or add a bottom-weighted inner scrim under titles; drop the credit's `opacity:.75`;
  unify the canvas value with the token. Suggested command: `$impeccable colorize`

### [P1] The German UI is half English — including the entire edit form and its errors
- **What:** `applyTranslations()` runs once during `init()` (`app.js:21-30,107`), before any dialog exists;
  dialogs created later keep `data-i18n` attributes that are never applied (`add-dialog.js:19-25`, `scan.js:24-25`).
  Verified in `de-DE`: header is German ("Ansicht | Bearbeiten | Hinzufügen") while the add dialog reads "Add
  Service / Add Manually / Scan Network", the scan dialog is English except the one `t()`-routed button, and the
  edit panel is entirely English (`edit.js:90,103-180`); validation messages, delete confirmation, scan
  statuses and "Photo by Pexels" are hard-coded — although `footer.credit.format` exists in both bundles.
- **Why it matters:** bilingual UI is a recorded brand commitment in PRODUCT.md; the user edits services in a
  different language than the switch they clicked.
- **Fix:** apply translations when dialogs are created, route every literal through the bundles (~20 keys),
  use `footer.credit.format`, replace `confirm()` with the system's own confirmation. Suggested command:
  `$impeccable clarify`

## Persona Red Flags

**Alex (power user)** — nothing opens Add/Scan/Edit by keyboard; Enter in the Name field does nothing (Save is
`type="button"`, `edit.js:181-192`); reorder is one drag per tile with no multi-select; editing one service
requires the full mode switch that turns every tile non-interactive (`grid.js:51,74-77`); at 30+ tiles no search
or filter, and the `position={row,col}` config model (`state.js:6,40`) is a fixed 4-column grid that does not
match the auto-fit shelf he sees; an address can't be read or copied without entering edit mode.

**Sam (keyboard/screen-reader)** — the add dialog takes no focus and traps nothing (verified: three Tabs land on
the page behind), required-field failures are colour-only and unannounced, reordering is impossible by keyboard
(`<article draggable="true">`, no tabindex/role/handler — verified), the reachable dot is colour + `title` only
and the scan status line has no `aria-live` (`scan.js:56,297`), the icon picker is not a combobox (no
`role`/`aria-expanded`/`aria-activedescendant`, results never announced), and every tile link announces its name
twice (`img.alt` + `h3`, `grid.js:72,79-80`). Credit: reduced-motion, reduced-transparency, forced-colors and
print fallbacks all exist.

**Timo (self-hoster on the couch, project-specific)** — both always-available controls sit top-right on an
844px screen, nothing primary in the thumb zone (bottom is a photo credit); the 173×173 tile targets are
excellent, but nothing says whether Jellyfin is up — no reachability, no last-seen, no refresh — so the product
promise is missing on the one screen he opens from the couch; and a running scan dies when the phone rings
(`scan.js:368-372`).

## Minor Observations

1. **[P2]** Edit-mode controls measure 34×34px and sit in driftwood grey over the service artwork
   (`components.css:322-325`, `mobile-edit.png`), below the system's own 48px mobile rule; pencil and trash sit
   8px apart.
2. **[P2]** Truncated names have no `title`/tooltip; only the edit panel shows the full name (verified at
   `scrollWidth 285 > clientWidth 126`); all twelve shipped names fit today.
3. **[P2]** A non-empty Port Range silently overrides Scan Depth while the depth radios stay interactive and
   checked (`scan.js:151-166`).
4. **[P2]** "No services found" covers three outcomes (empty host, unresolvable host, aborted scan) and suggests
   no next step; the icon picker's dead end hides its custom-URL escape hatch until the input already starts
   with `http` (`icon-picker.js:87-92`).
5. **[P2]** The icon dropdown ghost-texts the form through it: `--color-surface-elevated` is 90% opaque
   (`tokens.css:59`, `components.css:811-814`).
6. **[P2]** The live in-page detector also caught a page-own 404 to `cdn.simpleicons.org/turbopix`
   (`grid.js:23`, `icon-picker.js:145`) — the tile falls back to a placeholder glyph.
7. **[P3]** Duplicate name line on scan results when `service_name === title` (`scan.js:301-309`).
8. **[P3]** Three exits plus a stale "Start Scan" primary in the finished scan footer
   (`scan.js:26-27,70-74,246-248`).
9. **[P3]** The footer credit is permanent chrome with the weakest contrast in the product (11px mono,
   `opacity:.75`, `layout.css:102-104`).
10. **[P3]** Nothing locks the page behind an overlay (`document.body` overflow stays visible; overlays are
    fixed with internal scroll).
11. **[P3]** The empty state is inert text that names an unlabelled "+" and says "Tap" on desktop
    (`app.js:60-70`, `en.js`).
12. **[P3]** README/UI drift beyond the theme issue: "live results" (README:14), quick/thorough/exhaustive vs
    Simple/Medium/Deep, and the icon-source chain (README says SimpleIcons; runtime tries dashboard-icons →
    SimpleIcons → selfh.st, `grid.js:22-25`).

## Questions to Consider

1. If the scanner is the product, why is it three taps inside a generic "Add Service" chooser — and why does
   the dashboard show nothing while a scan is running?
2. PRODUCT.md says success is "open one page, see what is running". The page shows what is *configured*. Is the
   dashboard deliberately a launcher, or is the liveness half simply not built yet?
3. Which single first action should the empty shore offer: "Add" (a form for something the user already knows)
   or "Scan your network" (the thing no other dashboard can do without setup)?
