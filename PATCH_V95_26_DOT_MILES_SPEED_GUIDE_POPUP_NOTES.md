# PATCH V95.26 — DOT Miles Speed Guide Popup

Base: v95.25 DOT total miles only.

User direction:
- DOT Check should ask for miles when missing.
- Keep total miles only.
- Do not split miles by state.
- Add simple mileage suggestions based on driving time and common highway speeds.

Changes:
- Add miles popup now shows:
  - driving time for the selected leg
  - suggested miles at 62 mph
  - suggested miles at 65 mph
  - suggested miles at 68 mph
  - day driving total suggestions too if day total differs from the selected leg
  - optional location estimate if log locations are available
- Default value uses existing miles, then location estimate, then 65 mph guide.
- DOT Check issue detail shows driving duration.
- No GPS/motion recording added back.
- No state mileage split.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- verify-deep-scan-v952 passed.
