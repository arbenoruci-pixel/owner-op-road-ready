# PATCH V95.25 — DOT Total Miles Only

Base: v95.24 simple paper log mode.

User direction:
- DOT Check should say to enter miles if driving miles are missing.
- Do not split miles by state.
- Keep automatic driving/GPS mileage recording disabled.

Changes:
- DOT Check now raises: “Driving miles missing” when a DRIVING event has no total miles.
- Action: Add miles.
- The prompt asks only for total driving miles.
- Removed state-breakdown prompt from the active flow.
- Form Distance shows:
  - total miles when entered
  - Missing when a driving event exists with no miles
  - None when no driving exists
- GPS/motion tracking remains disabled.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- verify-deep-scan-v952 passed.
