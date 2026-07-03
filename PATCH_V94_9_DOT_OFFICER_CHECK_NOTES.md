# PATCH V94.9 — DOT Officer Check

Base: v94.8 Log Check tap-to-fix.

Changes:
- Added a clear DOT Officer Check inside the Sign tab before certification.
- The check acts like a roadside review:
  - Form/header fields
  - 24-hour log coverage
  - HOS review
  - Inspection/pre-trip
  - Certification
  - Previous 7-day package
- DOT Check can be opened from the SignGuard header or action row.
- Rows show OK / Review / Fix / Active status.
- Rows can route the driver to the right place where possible.
- Preserved existing RoadGuard/Fix Wizard, ChatGPT copy, DOT package table, and signing behavior.
- No timeline, HOS calculation, route-leg, inspection, or sync logic changed.

Validation:
- npm run build passed.
- npm run test:offline passed.
