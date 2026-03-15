# VT Guidelines

Last updated: 2026-03-15

## Purpose

Define one stable standard for VT authoring in this repo:

- Minimal and deterministic screenshots.
- Clear visual assertions for rendering behavior.
- Reduced flakiness in local and CI runs.

## Runtime Notes

- The VT Docker flow runs Chromium in a software WebGL fallback path on this repo's current container/runtime setup.
- Full-size `1920x1080` Pixi capture on that path is expensive, so VT syncs a local ignored `vt/static/RouteGraphics.js` bundle before VT runs.
- The sync script downloads `route-graphics@0.1.2/dist/RouteGraphics.js` from jsDelivr by default.
- Override the source with `VT_ROUTE_GRAPHICS_URL`, or just the package version with `VT_ROUTE_GRAPHICS_VERSION`.
- That VT-only bundle is patched during sync to initialize Pixi with `resolution: 0.5` and `preserveDrawingBuffer: true`.
- Full-frame VT references are exported from that native half-resolution render surface.
- Keep this path VT-only. Do not copy these settings into the product runtime without a separate rendering review.
- Do not switch VT back to the CDN `route-graphics` import unless you re-benchmark the Docker capture path.

## VT Workflow

- Capture screenshots with `bun run vt:docker`.
- Generate the comparison report with `bun run vt:report`.
- Accept an intentional visual change with `rtgl vt accept`.
- If the sync step needs a different upstream build, point `VT_ROUTE_GRAPHICS_URL` at the desired CDN file.
- Local VT defaults to `2` Docker workers and a `60000ms` timeout.
- VT is currently local-only. GitHub Actions VT is disabled again until the runner instability is fixed separately.

## Visual Standard

### Default Look

- Use black background by default.
- Use white or grayscale for foreground elements.
- Do not use saturated colors unless the test explicitly validates color behavior.

### Approved Palette

- `bg`: `#000000`
- `fg-100`: `#FFFFFF`
- `fg-80`: `#D9D9D9`
- `fg-60`: `#A6A6A6`
- `fg-45`: `#737373`
- `fg-30`: `#4D4D4D`

### Rules

- Keep snapshots black/white whenever possible.
- Use grayscale only when visual separation is needed.
- Avoid gradients, glow, and decorative styling in VT.
- If color is intentionally tested, explain why in the spec `description`.

## Asset Rules

### Backgrounds

- Prefer realistic static background assets from `vt/static/public/bg/`.

### Characters

- Character specs must use sprite assets from `vt/static/public/characters/`.
- Do not use circle placeholder assets for character tests.

## Character Placement Standard

- Use transform anchors:
  - `anchorX: 0.5`
  - `anchorY: 1`
- Treat positions as 1920x1080 coordinates.
- Place grounded characters on baseline `y: 1080`.
- Keep `x` positions aligned to intended screen composition (left/center/right lanes).
- Use original sprite dimensions, or proportional scaling from original, for 1920x1080 framing.

## Behavior Testing Rules

- Do not use on-screen debug log text as a behavior oracle.
- Use deterministic visual outcomes for VT assertions:
  - position (`x`, `y`)
  - size (`width`, `height`)
  - visibility (`alpha`)
  - layering (`zIndex`)
  - state changes (`src`, presence/absence)
- Move non-visual correctness checks to unit/integration tests.

## Authoring Checklist

- Uses approved grayscale palette unless color is explicitly the subject.
- Uses realistic/public assets where applicable.
- Character tests use sprite assets and bottom-center anchors.
- Snapshot steps are deterministic and minimal.
- No dynamic/debug text used as assertion signal.
