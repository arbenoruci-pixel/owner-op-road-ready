# PATCH V95.32 — Location Continuity Quick Fix

Base: v95.31 smart DOT officer logic.

Problem:
- DOT Check correctly detected “Location jump with no driving,” but the Fix Wizard only opened the event.
- The user wanted the message to focus on the actual error and offer direct location fixes/suggestions.

Changes:
- Location continuity issue message now focuses on the exact mismatch:
  - Current event starts in X immediately after previous event in Y.
  - If no driving occurred, the locations should match.
- DOT Check action label is now: Fix location.
- Fix action added: FIX_LOCATION_CONTINUITY.
- When tapped, it offers:
  - 1 = set current event location to previous event location
  - 2 = set previous event location to current event location
  - or type City, ST for the current event
- It updates the chosen event location, selects the event, opens the Log tab, and marks the day for recertification if needed.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- verify-deep-scan-v952 passed.
