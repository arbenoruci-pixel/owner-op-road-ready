# PATCH V95.64 — Day Shift Events

## Goal
Allow the driver to select all events for the active log day and shift them forward or backward together.

## Changes
- Added **Shift day events** to Log Tools.
- Opening Shift day events selects all real stored events for the active day.
- Added a visible selection strip on the Log tab: **All day / Clear / Shift / Done**.
- Shift sheet now shows **Shift Day Events** when the whole day is selected.
- Shift uses `rawStoredEventsForDay()` only, so synthetic/carry-forward/display rows are never moved or saved.
- After shift, route legs are re-synced and signed days are marked for recertification.
- Shift is clamped to the 24-hour log day so events cannot move outside 00:00–24:00.

## Acceptance
1. Open Log Tools → Shift day events.
2. All real events for the active day are selected.
3. Pick forward/backward and amount.
4. Preview shows old time → new time for each event.
5. Apply shift saves the shifted day, clears selection mode, and keeps the timeline order.
6. Synthetic display rows are not saved.
