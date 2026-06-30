# Patch v93.1 — Day-Start No-Gap Coverage

Fixes a remaining start-of-day graph gap where the first visible event started after midnight (example: OFF DUTY 2:48 AM–midnight left 12:00 AM–2:48 AM blank).

## Changes
- Added start-of-day coverage to display timeline normalization.
- If the first event starts after 00:00, the graph/totals now bridge 00:00 to the first event start.
- If the bridge status matches the first event status, it merges into one clean continuous row so users see a normal continuous event instead of a fake duplicate.
- If previous-day context is available, active day display uses previous final status for carry-forward coverage.
- If previous-day context is unavailable, display falls back to OFF DUTY as conservative coverage instead of leaving a blank graph segment.
- Graph, event list, Form/Sign/DOT display helpers now avoid the blank left-side gap produced by first-event-after-midnight data.

## Validation
- `npm run build` passed.
- `npm run test:offline` passed.
- No route changes.
- No continuous timeline override logic removed.
- No `node_modules` or `.next` in ZIP.
