# PATCH V95.55 — Day Switch Driving Display Guard

## Problem
A driver could create an ON DUTY Pre-trip, then start DRIVING and see the timeline look correct at first. After opening another day and coming back, the current day could visually turn into DRIVING from midnight/whole day.

## Root Cause
The remaining issue was not the insert override only. The day-switch/reload display layer still allowed previous-day or stale currentStatus DRIVING to be carried forward into the current day as synthetic coverage. A saved `carriedFromPreviousDay`/carryover DRIVING row or previous day ending in D could cause the graph/list to paint the start of today as DRIVING, even though the raw stored events should remain smart paper-log records.

## Fix
- Display timeline now ignores carried/synthetic coverage rows when rebuilding a day from state.
- Display start-gap fill never carries DRIVING across midnight. If previous day ended in D, the visual fallback is OFF unless a real D event exists today.
- Today carryover generation no longer creates a synthetic DRIVING row from previous-day status.
- normalizeState now derives currentStatus from the last real raw event for today. If there is no real raw event and saved currentStatus is stale D, it resets display state to OFF.
- Home list/graph now uses rawStoredEventsForDay for real log checks and graph source. Synthetic carryover rows no longer make Home show a fake DRIVING day.
- Insert default start now detects any event overlapping the last-15-minute window, not only events that started inside that window.

## Expected Result
Flow remains stable after day switch/reload:

OFF 12:00 AM–9:13 AM
ON 9:13 AM–9:28 AM Pre-trip Inspection
D 9:28 AM–now

Opening another day and returning must not turn the start of the day into DRIVING unless a real stored D event exists for that time.

## Files changed
- source/src/core/timeline/displayTimeline.js
- source/src/app/App.jsx
- source/src/modules/home/HomeScreen.jsx
- source/src/modules/editor/InsertEditEventSheet.jsx
- scripts/verify-day-switch-driving-display-v9555.mjs
- package.json
