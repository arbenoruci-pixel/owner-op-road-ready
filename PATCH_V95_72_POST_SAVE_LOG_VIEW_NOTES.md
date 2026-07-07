# Patch v95.72 — Post-save Log View Cleanup

## Problem
After saving a status/event, the Log tab could return to a graph-focused selected-event state. That state hid the event list/log check/certification rows and made the screen look like a mostly blank graph-only page.

## Fix
- DayLogScreen no longer applies `editing-graph` just because an event remains selected.
- Live status saves clear `selectedEventId` after save.
- Edit event saves clear `selectedEventId` and close the sheet in the same state update.
- Workflow/shift/auto-stop save paths also clear the selected event after saving.
- CSS adds a final safety override so even if an older selected graph-focus class appears, event rows/log check remain visible.
- CSS restores the log graph to natural SVG height after Save so the graph card does not leave a tall blank area.

## Safety
- Does not touch driving events.
- Does not touch duty status times.
- Does not touch miles.
- Does not touch route/load data.
- Does not touch DOT wallet/documents.
- Does not touch backup/import data.

## Expected behavior
After Save ON / Save event:
- Return to normal Log tab.
- Graph stays compact.
- Insert / Status / Drive rail stays visible.
- Event list remains visible below the rail.
- No blank graph-only screen.
