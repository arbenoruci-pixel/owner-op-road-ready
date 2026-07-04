# Patch v95.6 — Continuous Duty Line Graph

Base: owner-op-road-ready-main-8-v95.5-sign-crash-guard-no-root.zip
Scope: graph rendering cleanup ONLY. Zero changes to timeline logic, HOS
logic, insert/edit/move/delete, signing, DOT officer check, route legs,
inspection logic, app routes, or the data model.

## Files touched
- `source/src/modules/graph/LogGraph.jsx` — rendering layers rebuilt (display only)
- `source/src/styles.css` — one appended v95.6 rule (short-event marker shadow)
- `scripts/verify-continuous-line-v956.mjs` — NEW offline verifier (13 checks)
- `CHANGELOG.md`, this notes file

`displayTimeline.js` and `timelineEngine.js` were inspected and left untouched.
All screens that embed LogGraph (Day Log, Editor panel, Home preview, DOT mode)
inherit the fix automatically — no changes there.

## Problem
The duty trace was assembled from three independent visual systems that
overlapped and disagreed:
- Horizontal segments: `strokeWidth 8.1`, jumping to `12.6` when selected.
- Vertical transitions: a separate layer at `strokeWidth 3.6/5.4` — less than
  half the horizontal width — PLUS two `r=3.2` endpoint circles per bend.
- Short events: rendered TWICE (marker + "clear marker"), each with a ±15/±17px
  vertical spike line, plus background mask rectangles cutting neighbor rows.
- Selection: a 20px dark underlay line + endpoint circles + a width jump, so
  selecting an event visibly fattened and distorted the real line.

Result: corners looked glued together, thicker in places, dotted, and
double-stroked at transitions.

## New rendering model (three clean layers)

1. **Selection layer (bottom).** Soft row-fill rect (unchanged) plus a wide
   low-opacity glow line in the status color (`LINE_W + 12`, opacity .22),
   rendered UNDER the trace. Transition selection keeps its translucent pill.
   The real duty line never changes width or shape when selected.

2. **Continuous base path.** The already-existing (previously unused!)
   `continuousPath()` builder now actually renders: one single SVG `<path>`
   built from `M/H/V` commands over the normalized display timeline, in
   neutral dark slate `#172033`, `strokeWidth = LINE_W (8)`,
   `strokeLinecap="butt"`, `strokeLinejoin="miter"`. Horizontals and vertical
   bends are literally the same stroke, so thickness is identical by
   construction and every corner is a clean 90° miter — no dots, no caps,
   no overlap.

3. **Status-colored overlays.** Per-event horizontal lines at the SAME
   `LINE_W`, butt caps, inset by exactly half a stroke (`CORNER_INSET = 4`)
   on any end that meets a status change. The corner square stays the neutral
   trace color, so color changes at transitions while the physical body stays
   one seamless line. Segments too narrow to overlay simply show the neutral
   trace.

## What was removed (display artifacts only)
- Transition endpoint circles (`r=3.2`) — the "connector dots".
- The separate thin (3.6px) visible transition strokes — bends are now part
  of the base path.
- Selection width jump (12.6), the 20px dark underlay, and the r=13 selection
  endpoint circles (handles now appear ONLY in active edit mode, unchanged
  `edit-handles-large` block).
- Short-event vertical spike lines, the duplicate second marker pass, and the
  boundary mask rects. A short event is now the path's own narrow dip plus a
  single small status-colored dot with a white ring.
- Violation overlays: round caps → butt caps, width 12 → `LINE_W`, so the
  warning recolors the line instead of fattening it. Still no full-height
  guide lines; the `!` badge stays.

## What was preserved
- All tap/hit targets: 32px transparent event hit lines, 36px transparent
  transition hit lines, all `onSelect`/`onEmptyTap` behavior byte-identical
  in effect.
- Day-start normalization (first event pulled to 00:00) — same logic reused.
- Status palette (OFF/SB slate, D green-teal, ON blue) via `status.js`.
- Edit-mode grabbers, chips, and drag logic — untouched.
- Grid, labels, hour totals — untouched.

## Acceptance mapping
- D 00:00–02:00 → SB 02:00–24:00: one path `M…H…V…H…`, one bend, no dot,
  vertical exactly 8px like the horizontals.
- 1-minute ON between two statuses: visible as a narrow 8px dip + dot marker;
  no spikes, no broken joints, no masks.
- No transition renders two stacked strokes (verifier asserts the transition
  layer contains only transparent hit lines).
- No vertical warning guide lines (carried over from v95.2, re-asserted).

## Validation (honest, offline)
- `npm ci` / `npm run build`: **cannot run** — npm registry returns 403 in
  this environment (persistent constraint). `next build` must run on deploy.
- `npm run test:offline`: **passed** (offline sync smoke test).
- `node scripts/verify-deep-scan-v952.mjs`: **8/8 passed** (includes the
  LogGraph no-dashed-guide assertion — still green after the rewrite).
- `node scripts/verify-continuous-line-v956.mjs`: **13/13 passed** — balanced
  JSX/delimiters, single continuous path, uniform LINE_W, butt/miter, no join
  dots, corner insets, glow-under-trace ordering, handles gated to edit mode,
  short-event cleanup, violation overlay rules, palette intact, CSS rule.

## Notes for reviewers
- The old CSS recolor rule `.log-graph .smooth-transition line[stroke="#223047"]`
  no longer matches anything (transitions have no visible stroke); it was left
  in place to keep the CSS diff minimal. The base path uses `#172033` directly,
  matching the previous effective on-screen color.
- `package.json` version intentionally untouched (scope isolation).
