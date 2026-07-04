# PATCH V95.3 — Manual Driving Miles Fix

Base: v95.2 deep scan fix.

Changes:
- Log Check “Manual driving exists” Fix action now prompts the driver to enter miles for the manual DRIVING event.
- Driver can enter:
  - miles
  - state for those miles
- Saved values are stored on the DRIVING event:
  - manualMiles
  - manualMilesState
  - manualMilesReviewedAt
- After manual miles are recorded, the manual-driving warning is cleared for that event.
- Form distance summary now includes manual miles plus GPS miles.
- No timeline/HOS time calculation changes.
- No route, DOT, inspection, signing, or sync logic changes.

Validation:
- npm run build passed.
- npm run test:offline passed.
- v95.2 deep scan verification passed.
