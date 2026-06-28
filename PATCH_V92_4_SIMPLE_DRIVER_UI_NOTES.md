# Patch v92.4 — Simple Driver UI (Logs list redesign)

## Summary
Replaced the busy Aurora Home screen with a calm, row-based **Logs list** that matches the
requested simple-driver structure (status strip → TODAY → LAST 14 DAYS). This is a
presentation-only change. No compliance logic, no routes, and no other screens were modified.

The Motive screenshots were used only as a structural reference (simple list, row layout,
short labels). The visual identity here is original: own header style, own status chips, own
spacing/typography, own warning treatment, calm blue accent (#1a73e8).

## Files changed
1. `source/src/modules/home/HomeScreen.jsx` — rewritten (busy multi-card Aurora layout →
   simple Logs list). Same default export, same props contract.
2. `source/src/styles.css` — appended one namespaced block (`lv-*`) at the end. No existing
   selector was edited; no `!important` was added.
3. `CHANGELOG.md` — added the v92.4 entry.

## New Home structure
- **Header**: dark bar titled "Logs" + compact "DOT" button → DOT Inspection Mode.
- **Status strip** (1×2): duty-status marker + label + location  |  current vehicle.
  - Status cell → Status workflow sheet (contains Start Driving).
  - Vehicle cell → Equipment sheet.
- **Attention row** (only if unsigned > 0): "N logs need signing" → Unsigned Logs screen.
- **TODAY**: one compact row + small continuous-timeline graph preview.
- **LAST 14 DAYS**: compact rows — status marker, weekday + date, total + cert status,
  a small ✓ (certified) or soft "!" (completed day needing attention), chevron.
- **Bottom**: single "DOT Inspection Mode" row.

## Removed clutter (per spec)
Hero/greeting, compliance grid, quick tiles, today/maintenance/messages/recent-logs cards,
the fake hardcoded bottom timer, and the destructive data-reset that was wired behind the
Home hamburger.

## Logic preserved (unchanged)
Continuous no-gap timeline, RoadGuard/SignGuard, DOT previous-7-days package, ChatGPT
fix-plan parser, inspection/pre-trip linkage, Dexie/IndexedDB queue, Supabase, offline sync.
`source/src/app/App.jsx` and every other screen/sheet are byte-for-byte unchanged.

## Behavior notes / deltas to be aware of
- **GPS/Drive entry from Home**: the old standalone "Tracking" tile / GPS tools button is
  gone from Home. Driving is still reachable: tap the status cell → Status workflow →
  Start Driving, and the Driving Focus screen still auto-opens when status becomes D. The
  in-Day "Drive" action is unchanged.
- **Data reset**: the destructive "clear everything" action that lived behind the Home
  hamburger was intentionally dropped from the consumer Home (no confirmation, easy to hit).
  The underlying `reset()` in `App.jsx` is untouched; it is simply no longer triggered from
  this screen.
- **Active day** is always neutral (never red). Only completed (past) days that are not
  certified show the soft "!" marker.

## Validation performed in this environment
- `node scripts/offline-sync-smoke-test.mjs` → **passed** (logic untouched).
- New `HomeScreen.jsx`: balanced parens/braces/brackets and balanced JSX tags
  (string/comment-aware static check).
- All imports in `HomeScreen.jsx` resolve to existing files and named exports.
- `styles.css` brace balance verified (1179/1179).
- Confirmed only `App.jsx` imports `HomeScreen`, and the props it passes still match.

## Not run here (and why)
- `npm run build` (`next build`) could **not** run: the npm registry blocks tarball
  downloads in this sandbox (HTTP 403), so `next`/`react` cannot be installed. The change is
  presentation-only and was statically validated as above, but please run `npm run build`
  locally/CI before deploy to get the full Next/SWC type + hydration check.

## Remaining risk
- Low. The change is isolated to one screen's JSX + an additive CSS block. The main residual
  risk is the unrun `next build` (sandbox limitation). The Day Log / Form / Sign / Inspection
  / DOT screens already follow the tab + row structure from the spec and were intentionally
  left untouched in this step; simplifying their internal density (e.g. collapsing the Sign
  tab's explanatory text and inline ChatGPT helper by default) can be done as a focused
  follow-up once this Logs-list direction is approved.
