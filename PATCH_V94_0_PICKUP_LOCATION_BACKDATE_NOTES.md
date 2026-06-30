# PATCH V94.0 — Pickup Location + Backdate Override

Base: v93.9 linked load/form behavior.

Changes:
- Fixed manual location input in Change Status:
  - typing no longer reparses every keystroke
  - city/state is parsed on blur/save
  - driver can type `Romeoville, IL` normally
- Added quick city suggestions:
  - current location
  - pickup/delivery locations
  - Romeoville, Joliet, Bolingbrook, Willowbrook, Chicago, Toledo
- Kept GPS available, but manual city override now works cleanly.
- Added compact start-time picker:
  - Now
  - 15m ago
  - 30m ago
- Live ON DUTY/Pickup backdate now overrides the previous OFF DUTY block for the full backdated window.
  Example:
  - before: OFF until now
  - save ON Pickup 15m ago
  - after: OFF until 15m ago, ON Pickup from 15m ago through now
- Pickup/Delivery BOL and destination remain linked to the event.
- No route changes.
- No DOT/RoadGuard/inspection/ChatGPT parser changes.

Validation:
- npm run build passed.
- npm run test:offline passed.
