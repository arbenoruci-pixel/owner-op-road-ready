# PATCH V94.1 — Driving Stop + Midnight Rollover

Base: v94.0 pickup/location/backdate.

Fixes:
- Fixed stop-driving failure caused by stale `nowLiveMin` reference in stop-to-ON logic.
- STOP DRIVING / auto-stop now safely closes the active DRIVING event and starts ON DUTY at the current minute.
- Added active-driving midnight rollover:
  - previous-day DRIVING event closes at 24:00
  - new-day DRIVING event starts at 00:00 and continues to now
  - GPS trip eventId moves to the new-day driving event
  - activeDay moves to today without losing prior day hours
- GPS driving update now checks rollover before extending the active event.
- Drive Focus 11-hour display counts elapsed GPS driving from original startedAt timestamp so the clock does not reset at midnight.

Validation:
- npm run build passed.
- npm run test:offline passed.
- No route changes.
- No node_modules or .next in output ZIP.
