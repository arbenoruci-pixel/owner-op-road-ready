# PATCH V95.56 — Sign/Overlap Midnight Driving Repair

## Problem
After v95.54/v95.55, a driver could still see today's log turn into one DRIVING block from midnight after opening Sign/Log Check on another day and returning. The UI showed an overlap review, then the current day rendered as DRIVING 12:00 AM–now.

## Confirmed remaining risk
Legacy/stale synthetic carryover rows could still survive in local state as `source: carryover` or similar display-only rows. Some write/normalize paths filtered `carriedFromPreviousDay` and `timeline_continuity`, but not every display-only source value. Once a stale carryover/midnight DRIVING row survived, sign/log-check/day-switch paths could treat it as a real raw event.

## Fix
- `rawStoredEventsForDay` now treats `source: carryover`, `display`, and `display_timeline` as synthetic/display-only.
- `commitTimelineForDay` now uses one hard purge/repair path instead of hand-filtering only a few synthetic flags.
- `normalizeState` purges synthetic rows on hydration/reload before deriving current status.
- Today carryover is now display-only and is not inserted into `eventsByDay`.
- Added a legacy repair guard: if a corrupted DRIVING row starts at midnight and covers an accepted ON DUTY Pre-trip / inspection window, the app repairs it into OFF before Pre-trip, ON Pre-trip, and DRIVING only after Pre-trip.

## Expected Result
ON DUTY Pre-trip followed by DRIVING remains stable after:
- opening yesterday's Sign tab,
- seeing a Log Check overlap review,
- returning to today,
- refreshing/reopening the app.

The log should not become one DRIVING row from 12:00 AM.

## Files changed
- source/src/app/App.jsx
- source/src/core/compliance/rawRodsChecks.js
- source/src/core/timeline/displayTimeline.js
- scripts/verify-sign-overlap-midnight-driving-v9556.mjs
- package.json
