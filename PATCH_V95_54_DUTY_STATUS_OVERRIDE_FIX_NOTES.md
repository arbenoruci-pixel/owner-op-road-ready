# PATCH v95.54 — Duty Status Override Fix (ON Pre-trip -> DRIVING bug)

## Goal
Stop the app from ever silently converting or deleting an ON DUTY Pre-trip
(or any earlier event) when the driver adds DRIVING after it. A manual duty
status must only change when the driver explicitly edits that exact event.

## Root cause (confirmed by reproduction, not guessed)
The bug was reproduced offline with the real engine code. It is a chain of
three behaviors:

1. **Live status rows are stored short.** `closeLastAndAddStatus` stores a
   live "ON Pre-trip" tapped at 9:13 as a raw row `ON 9:13–9:14` (start..start+1).
   The display timeline extends it to "now", so it *looks* like ON 9:13–9:28.
2. **The Insert sheet always defaulted new events to "15 minutes ago".**
   At 9:28, an inserted DRIVING event defaulted to `D 9:13–9:28`.
3. **`insertEventOverride` deletes fully covered events.** `D 9:13–9:28`
   fully covered the raw `ON 9:13–9:14` row, so the ON event was **deleted**
   and the whole period displayed as DRIVING. The auto pre-trip inspection was
   then also removed by `reconcilePreTripInspectionForDay` because its source
   event no longer existed.

So: real stored events were being destroyed (not a display-only artifact),
triggered by the insert flow, without the driver ever touching the ON event.

Reproduction before the fix:
- raw after ON tap: `[ON 553–554]`
- raw after D insert with default times: `[D 553–568]` — ON gone.

## Changes

1. **`source/src/core/timeline/timelineEngine.js`** — new pure export
   `protectLiveTailFromInsert(baseEvents, incoming)`. If an incoming event has
   a DIFFERENT status, fully covers the day's last stored event, and reaches
   past its end, the incoming event's start is moved to the previous event's
   stored end ("Driving started, Pre-trip kept"). An EXACT cover (same
   start and end) is still an explicit overwrite and remains allowed.
   Partial overlaps are untouched (trim behavior unchanged).

2. **`source/src/app/App.jsx`**
   - `addEvent`: applies `protectLiveTailFromInsert` before
     `insertManyOverride`, with dev-safe before/after traces.
   - `addDriverWorkflowEvents`: write base changed from the raw
     `s.eventsByDay[day]` array (which included carryover rows) to
     `continuousBaseForDay` (rawStoredEventsForDay); save now goes through
     `commitTimelineForDay` so no carryover/synthetic rows are ever written;
     same tail guard applied.
   - `startDrivingFromMotion`: write base changed from the raw array to
     `continuousBaseForDay`; save wrapped in `commitTimelineForDay`.
   - New module-level `traceDutyWrite` helper behind `DEBUG_DUTY_TRACE = false`
     (flip locally to log raw rows around duty writes: id, status, startMin,
     endMin, note, source, syntheticCoverage, carriedFromPreviousDay).
     Trace calls added in `addEvent` and `closeLastAndAddStatus`.

3. **`source/src/modules/editor/InsertEditEventSheet.jsx`** — new
   `safeDefaultStart(events)`: if any existing event overlaps the
   15-minute backdate window, the new insert defaults to start NOW instead of
   15 minutes ago. Explicit times and the Now/15m/30m chips still work; only
   the silent default changed.

4. **`scripts/verify-duty-status-override-v9554.mjs`** — new offline verifier
   (details below).

5. **`package.json`** — version 95.53.0 -> 95.54.0.

## Files touched
- source/src/core/timeline/timelineEngine.js
- source/src/app/App.jsx
- source/src/modules/editor/InsertEditEventSheet.jsx
- scripts/verify-duty-status-override-v9554.mjs (new)
- package.json (version only)
- PATCH_V95_54_DUTY_STATUS_OVERRIDE_FIX_NOTES.md (this file, new)

## What was intentionally NOT changed
- No routing changes, no compliance/HOS math changes.
- `insertEventOverride` core trim/split/cover semantics unchanged — the guard
  is applied only in the insert write paths (`addEvent`,
  `addDriverWorkflowEvents`), so the coverage wizard, RoadGuard fixes, edit
  override, shift, and rollover paths behave exactly as before.
- The live Status -> Driving flow (`closeLastAndAddStatus` via
  `closePreviousAndStart`) was verified correct and left alone: it closes ON
  at drive start with a new D event id.
- No Move/Edit/Void bar, no GPS/motion auto-driving, no new UI text beyond
  code comments.

## Acceptance tests (spec) — status
- TEST 1 (ON then Driving, explicit times): PASS — OFF/ON/D stay separate,
  distinct ids, no D at 00:00.
- TEST 2 (short ON then Drive): PASS — ON closes at drive start, D is a new id.
- TEST 3 (overlap replaces only overlap): PASS — ON 9:00–9:15, D 9:15–10:00.
- TEST 4 (no overlap): PASS — nothing changes.
- TEST 5 (inspection link): PASS — ON event id unchanged, so
  `inspection.sourceEventId` stays linked; the deletion path that previously
  removed the auto inspection can no longer trigger from a D insert.
- TEST 6 (display vs raw): PASS — rawStoredEventsForDay filters synthetic
  rows; all insert/motion/workflow saves now pass through
  `commitTimelineForDay`.
- TEST 7 (current status card): current status comes from the last display
  event; with ON preserved and D starting at its real start, the card shows
  DRIVING only from D start forward. Validated by code path review; needs a
  quick visual confirmation on device.

## Validation run (offline)
- `node scripts/verify-duty-status-override-v9554.mjs` — 64 checks passed
  (behavioral acceptance tests + regression of the exact reported bug +
  static write-path checks).
- `npm run test:offline` — passed.
- `node scripts/verify-deep-scan-v952.mjs` — 28 checks passed.
- `node scripts/verify-continuous-line-v956.mjs` — 13 checks passed.
- Engine module import check + brace/paren balance on edited JSX files passed.

## Honest limits of offline validation
- npm registry is blocked in this environment: `npm ci` / `next build` were
  NOT run; JSX files were not compiled. The edits are small and structurally
  verified, but please run a normal Vercel/`next build` before deploying.
- On-device flows to eyeball after deploy (2 minutes):
  1. Status -> ON Pre-trip, wait ~15 min, Insert -> Driving with default
     times -> ON must remain in the event list and graph.
  2. Status -> ON Pre-trip, then Status -> D (Drive) -> ON closes at drive
     start.
  3. Pre-trip inspection stays linked/complete after adding Driving.
