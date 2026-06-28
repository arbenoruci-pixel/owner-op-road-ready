# Patch v92.5 — Original Driver UI (brand differentiation)

## Summary
A presentation-only pass to give Owner-Op Road Ready a clearly original look-and-feel, so a
driver, broker, officer, or customer would not confuse it with any reference app. The simple
row-based driver workflow and 100% of the compliance logic are preserved. No new routes.

Only four files changed, and only one (`HomeScreen.jsx`) is a structural rewrite — the rest
are color/value or additive-CSS changes.

## Files changed
1. `source/src/shared/utils/status.js` — duty-status colors only (single source of truth for
   the graph + all chips/badges). OFF/SB = graded steel-slate, D = green, ON = Road Ready blue.
2. `source/src/modules/graph/LogGraph.jsx` — grid + duty-line **color values only** (softer
   warm grid, navy rounded duty line). No geometry, totals, or timeline math touched.
3. `source/src/modules/home/HomeScreen.jsx` — rewritten to the original Logs identity
   (light wordmark header, status strip with duty chip, left status-rail rows with chip +
   total + cert + inspection status + warning count). Same default export, same props.
4. `source/src/styles.css` — appended one v92.5 brand-theme block (palette tokens + overrides
   for header/tabs/event rows/form/sign/inspection/DOT + the new `rr-*` Logs classes). The
   prior v92.4 `lv-*` block was removed. No existing rule above the block was edited.

`App.jsx`, `Chrome.jsx`, and every core/logic/sync file are unchanged.

## Brand identity
- Palette: warm off-white #f5f3ee, deep navy ink #1b2435, calm blue #2557c7, green #2f9e60
  (ready), amber #d68a26 (review), red #cf4b4b (fix).
- Header: navy day header with left title + 2px blue accent rule; Logs header is a light bar
  with a "Road Ready · Logs" wordmark and a "DOT Mode" pill. No centered dark title bar, no
  red notification dot.
- Tabs: rounded segmented/pill control (filled blue active), not an underline.
- Logs rows: left color rail + status chip + warning count; no checkbox/chevron list.
- Graph: softer warm grid, navy rounded duty line, navy/muted labels.
- Event rows: rounded duty chip (not circle); outlined accent edit button.
- Form: rounded section containers with our headers. Sign: compact accent-bordered card.
  Inspection: our borders/greens. DOT mode: navy + blue official identity.

## Logic preserved (unchanged)
Continuous no-gap timeline, RoadGuard/SignGuard, DOT previous-7-days package, ChatGPT
fix-plan parser, inspection/pre-trip linkage, Dexie/IndexedDB queue, Supabase, offline sync.
Because the changes are colors + one screen's markup + additive CSS, none of the HOS,
timeline, totals, or sync code paths were modified.

## Validation performed in this sandbox
- `npm run test:offline` → **passed** (logic untouched).
- `HomeScreen.jsx`: balanced brackets + balanced JSX tags; all imports resolve (incl. the
  newly used `validateLogForSigning`).
- `LogGraph.jsx`: diff confirmed **color-values only**; bracket balance clean.
- `status.js`: `node --check` clean.
- `styles.css`: brace-balanced (1246/1246); no malformed declarations in the new block;
  no leftover `lv-*` references anywhere.

## Not run here (and why)
- `npm run build` (`next build`) could **not** run: the npm registry blocks tarball downloads
  in this sandbox (HTTP 403), so `next`/`react` can't be installed. Changes are
  presentation-only and statically validated, but please run `npm run build` in CI/local
  before deploy for the full Next/SWC + hydration check.

## Audit checklist (against the spec)
- Routes: unchanged. node_modules/.next: not included. Broken imports: none found.
- Graph totals vs Form/Sign/DOT: unaffected (no math changed).
- Continuous timeline / active-day-to-now / completed-day 00:00–24:00: unaffected
  (timelineEngine/displayTimeline untouched).
- Mobile overflow / iOS Safari toolbar / keyboard: the Logs list uses safe-area padding and a
  max-width column as before; no new full-height inputs were added. Re-check on device after
  `next build`.

## Remaining risk
- Low, and concentrated in the unrun `next build` (sandbox limitation). The CSS override
  approach relies on `!important` to sit on top of the existing `!important`-heavy stylesheet;
  if any third-party/global rule has even higher specificity for a given property it could
  win, but the targeted selectors here match or exceed the existing ones. Visual spot-check on
  a device is recommended, especially the Day header, pill tabs, and the graph contrast.
