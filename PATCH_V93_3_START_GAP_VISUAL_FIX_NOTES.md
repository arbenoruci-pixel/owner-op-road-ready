# Patch v93.3 — Start Gap Visual Fix + Thinner Graph Line

## Purpose
Fix a regression where the Log tab graph could still show a blank start-of-day gap when the first raw duty event started after midnight, and make the duty-status line 10% thinner for better readability.

## Changes
- DayLogScreen now derives its own display timeline from `displayEventsForDayFromState(...)` and uses that normalized timeline for:
  - Log graph
  - event list
  - Form summary
  - Inspection panel
  - Log Check panel
- LogGraph now also has a defensive start-gap guard: if a caller ever passes raw events whose first event starts after midnight, the graph extends that first event back to 00:00 for visual continuity.
- Reduced duty-status line stroke widths by approximately 10%:
  - normal line: 9 → 8.1
  - selected line: 14 → 12.6
  - transition line: 4 → 3.6
  - selected transition line: 6 → 5.4
  - short-event marker line: 3 → 2.7

## Preserved
- No route changes.
- No timeline/override business logic was removed.
- No RoadGuard/DOT/inspection/ChatGPT parser logic changes.
- No node_modules or .next included in output ZIP.

## Validation
- npm run build passed.
- npm run test:offline passed.
