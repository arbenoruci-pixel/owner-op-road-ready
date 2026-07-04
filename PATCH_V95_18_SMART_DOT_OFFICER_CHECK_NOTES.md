# PATCH V95.18 — Smart DOT Officer Check

Base: v95.17 sign tab runtime fix.

Changes:
- Added a new `source/src/core/dot/dotOfficerCheckEngine.js`.
- DOT Check now builds structured sections:
  - Form fields
  - Log coverage
  - Locations
  - HOS review
  - Inspection
  - Previous 7 days
  - Route / shipping
- Each issue carries a route/action:
  - form field
  - exact event
  - HOS range
  - inspection tab
  - sign tab
  - previous day
  - route/shipping section
  - manual miles prompt
- Sign tab now renders the Smart DOT Check sections and issue list.
- Issue buttons route the driver to the relevant tab/event/field flow.
- UI language remains neutral: Fix, Review, Add miles, Add BOL, Create day, Open.
- No timeline/HOS calculation rewrite.
- No sign validation, inspection, route-leg storage, or sync logic changed.

Validation:
- npm run build passed.
- npm run test:offline passed.
- v95.2 deep scan verification passed.
