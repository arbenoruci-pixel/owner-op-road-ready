# PATCH V95.42 — Field Safety P0

Base: v95.41 PWA + deep scan prompt.

High-risk fixes from Pro deep scan:
- Production mock duty logs removed.
- Production no longer defaults to fake Unit 12 / Trailer 53.
- normalizeState no longer merges initialEventsByDay into saved state.
- Added raw RODS compliance helper:
  - source/src/core/compliance/rawRodsChecks.js
- DOT Check and signing validation now use raw stored events for compliance coverage instead of visual display-filled rows.
- Previous 7-day package checks now use raw stored events and catch:
  - missing previous day
  - incomplete previous day
  - previous day unsigned
  - previous day needs recertification
- Edit/insert/delete/move base events now use raw stored events instead of display-generated synthetic coverage rows.
- Location continuity fix context now uses raw stored events.
- Future day is no longer treated as active/current day.
- Signing missing-location check now flags missing city OR missing state.
- Inspection complete + Pre-trip event with no sourceEventId now flags unlinked inspection.
- Delivery event route-link check no longer passes just because any delivered route leg exists.
- App no longer requests GPS on launch in smart paper-log mode.
- package.json version updated to 95.42.0.

Still intentionally not included:
- Full local save status UI / export backup.
- Create missing day modal.
- Day-level total driving miles model.
- Full offline app-shell service worker caching.

Validation:
- npm ci
- npm run build
- npm run test:offline
- verify-deep-scan-v952
