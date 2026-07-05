# PATCH V95.52 — Today Anchor + Graph Readability

## Goal
Home Logs screen must always show the real local calendar day first, followed by the previous 7 days. Older saved logs remain accessible without moving the home list away from today.

## Changes
- Home screen anchor day is now `localDayKey()` every time, not persisted `state.activeDay`.
- Status summary uses today's log/current status, not a stale opened day.
- If today's raw events are empty, the home graph shows a display-only current status block from midnight to now. This is not saved and is not used for compliance.
- Previous 7 days are always calculated from today.
- Removed the home graph `Open` overlay pill.
- Made graph grid/labels clearer and flatter, closer to the Motive readability style.
- Package version bumped to 95.52.0.

## Safety
The display-only home event uses `source: home_display_only` and is never written to `eventsByDay`. DOT/signing validation still uses raw stored events.
