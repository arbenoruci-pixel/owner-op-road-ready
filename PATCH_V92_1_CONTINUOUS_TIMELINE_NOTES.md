# Patch v92.1 — Continuous Timeline / No-Gap Logbook

## Goal
Fix the critical logbook timeline issue where the graph and report could show blank/uncovered time after an event ended early. A CMV daily log must be represented as a continuous duty-status timeline. Every minute must belong to OFF, SB, D, or ON.

## Changes
- Added a shared continuous timeline builder in `source/src/core/timeline/timelineEngine.js`.
- `displayEventsForDay()` now carries each duty status forward until the next duty-status change.
- Last event carries forward:
  - to `now` for the active/current day
  - to midnight/end-of-day for completed days
- Graph, event list, Form totals, SignGuard/RoadGuard, DOT Mode, DOT report, home preview, and HOS engine now use the continuous timeline where appropriate.
- `closePreviousAndStart()` now closes the previous raw event up to the new status start even if the previous raw event ended early.
- HOS/status-reason review now catches OFF/SB events with notes like “On Duty,” so conflicts such as OFF DUTY + “Stopped / On Duty” are flagged before signing.
- Time labels now show `1440` as `12:00 AM` instead of clamping to `11:59 PM`.

## Safety behavior
- The app does not ask the driver to falsify records.
- The timeline treats a duty status as remaining active until the next duty-status change, which matches the logbook model.
- True status/note conflicts remain flagged for review/fix before signing.

## Validation
- `npm run build` passed.
- `npm run test:offline` passed.
- No route files were added or changed.
