# Patch v95.2 — Deep Scan Fix

Scope: full QA audit + three surgical fixes. No routes changed, no schema
changes, no redesign, no logic rewrites outside the three sites below.

## Fixed

### 1. CRITICAL — phantom HOS hours while reviewing a past day
`source/src/core/hos/hosEngine.js` → `buildContinuousTimeline`

Today's day was only treated as the "current/open" day when it was also the
day being viewed (`dayKey === today && dayKey === activeDay`). Reviewing or
signing any previous day therefore treated today as a *completed* day and
extended today's last open event to 24:00. An open DRIVING/ON event silently
gained hours of phantom time, producing:

- False "11-hour driving limit appears exceeded" / "14-hour window appears
  exceeded" / "30-minute break required" / "70-hour cycle" warnings in Log
  Check while reviewing yesterday.
- Wrong 11h/14h/Cycle card values on past-day review and in the sign flow.

Reproduced offline: a 30-minute live drive counted as 30 min with
`activeDay = today` but 206+ min (to midnight) with `activeDay = yesterday`.

Fix: `isCurrentDay: dayKey === today`. Completed past days still extend to
24:00; today always extends only to now.

### 2. Graph — vertical dashed warning guide line removed
`source/src/modules/graph/LogGraph.jsx`

Violation overlays still drew a full-height dashed vertical line at the
violation start, against the "no vertical warning guide lines" requirement.
The colored segment overlay, start marker, and "!" badge stay. Display-only.

### 3. Change Status — late auto-GPS no longer overwrites manual location
`source/src/modules/status/StatusWorkflowSheet.jsx`

Picking OFF triggers an automatic GPS lookup (up to 12 s). If the driver
typed a city/state while it was pending, the resolving fix clobbered the
manual text. Added a `manualLocationDirty` ref: any manual keystroke,
suggestion tap, or clear blocks a *pending automatic* fix. The explicit
"Use GPS" button still always applies (it resets the flag).

## Verified / unchanged (audit result, no code change)

- Insert/override engine: ON inside OFF splits and resumes correctly; full
  cover deletes the old event; no stale notes survive override; 1-minute
  events survive; edit keeps neighbors gap/overlap-free (17/17 harness
  checks).
- Start-of-day coverage uses previous-day status; completed days cover
  00:00–24:00; active day covers 00:00–now.
- Motion watch is OFF by default (`AUTO_MOTION = false`, `armed = false`);
  driving only starts via explicit Start Driving + GPS or armed motion.
- Manual DRIVING does not open the Driving Focus screen (requires active
  GPS trip).
- Midnight rollover closes the previous day at 24:00 and re-opens DRIVING at
  00:00 with the GPS trip re-linked.
- Auto pre-trip inspection reconciles on add/edit/move/shift/delete and is
  removed when its source event disappears.
- Route legs: pickup creates/opens, delivery closes, delete removes/reopens,
  times re-sync from linked events; completed legs stay on their own day.
- DOT Mode exposes no rate/broker/private wallet data; report uses the
  normalized display timeline.
- ZIP hygiene: no `node_modules`, no `.next`; `test:offline` passes.

## Validation (npm registry blocked → offline strategy)

- `node --check` on all plain JS: clean.
- esbuild bundle of the full client tree (`app/road-ready-client.jsx`,
  React/Supabase/Dexie external): compiles clean before and after patch.
- `npm run test:offline`: passed.
- New `scripts/verify-deep-scan-v952.mjs`: 8/8 checks passed
  (run: `node scripts/verify-deep-scan-v952.mjs`).
- `npm ci` / `next build` could not run in this environment (registry
  blocked); run them on Vercel/local before shipping.

## Remaining risks (not patched — flagged for review)

1. If an insert *splits* the ON DUTY Pre-trip event itself, the split renames
   the event id (`..._left_...`), so a driver-accepted inspection loses its
   `sourceEventId` link and stops auto-following time edits. Rare; needs a
   chain-id follow strategy, not a quick patch.
2. `violationRangesForDay` paints an amber "rest watch" overlay on every rest
   block under 10h — including normal 30-minute breaks on past days. Working
   as coded, but consider limiting it to the *current* rest block if it reads
   as noise in the field.
3. `validateLogForSigning` overlap check indexes `rawEvents` by the display
   array index (arrays can differ in length). Harmless today because storage
   is normalized on every write, but latent.
4. HOS card values on a past-day view reflect *current* clocks (linked
   timeline through now) — intended, but worth confirming that is the wanted
   UX when reviewing old days.
5. Home "Last 14 days" rows each run a full multi-day HOS pass
   (`validateLogForSigning` per row). Fine at current data sizes; memoize if
   the list ever feels slow.
