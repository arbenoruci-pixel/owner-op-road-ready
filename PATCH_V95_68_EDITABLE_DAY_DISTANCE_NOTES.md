# Patch v95.68 — Editable Day Distance

## Purpose
The Form tab showed `Distance: Missing` for a day with DRIVING events, but the driver had no direct place in the Form tab to enter the DOT/paper-log total miles.

## Changes
- Made the Form tab `Distance` half-card editable.
- Tapping `Distance` prompts for total driving miles for the active log day.
- Saves day-level miles under `manualMilesByDay[day]`.
- Does not change duty status events, driving start/end times, route legs, inspections, signatures, or GPS data.
- DOT Officer Check now accepts either day-level total miles or existing event-level manual miles.
- Signed/certified days are marked Needs Recertification when day distance is edited.

## Safety rules
- True DRIVING events are not moved, split, extended, or rewritten.
- Distance entry is metadata/form data only.
- A zero value clears day-level distance.
