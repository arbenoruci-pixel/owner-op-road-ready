# Patch v92.9 — Log Timeline / Graph Usability Fix

Scope: logbook only. No route changes.

## Fixed

- Event insert/edit/delete now uses the continuous display timeline as the override base.
- If a driver inserts or moves an event inside an ongoing OFF/SB/D/ON block, the old block is split correctly:
  - previous segment ends exactly at the new event start
  - inserted/edited event occupies its real duration
  - following segment starts exactly at the new event end
- Deleting an inserted event now lets the neighboring same-status coverage reconnect instead of leaving a silent gap.
- Shift selected events now clamps movement so selected events stay inside the 00:00–24:00 log day and no longer shows false cross-day previews when the app will clamp the move.
- Short 1-minute events now receive a minimum visual marker on the graph so they do not look like a graph glitch. Real event times/durations are not changed.
- The main graph now uses more horizontal space inside the card and removes excess bottom whitespace when not in edit-handle mode.
- Bulk Shift button readability fixed on iPhone/Safari.

## Safety behavior kept

- No automatic falsification of event time/status.
- HOS/time issues remain review-only unless the driver manually edits the actual log.
- Continuous no-gap display remains the source for RoadGuard/DOT visual checks.
- Inspection/pre-trip reconciliation remains active.

## Validation

- `npm run build` passed.
- `npm run test:offline` passed.
- Manual timeline smoke check passed for OFF → ON Pre-trip 1 minute → OFF split behavior.

## Packaging

- No-root ZIP.
- Excludes `node_modules`.
- Excludes `.next`.
