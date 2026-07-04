# PATCH V95.23 — Manual Miles State Breakdown

Base: v95.22 manual miles null-coordinate fix.

Problem:
- Manual miles flow asked for one state only.
- That is not enough for a route that crosses states, e.g. Willowbrook, IL -> Indianapolis, IN.

Fix:
- Manual miles flow now asks for state mileage breakdown.
- Default breakdown comes from:
  1. GPS milesByState if GPS points exist
  2. log-location state split if GPS points do not exist
  3. single-state fallback if no route split is available
- Added local route split helper for common Midwest corridors:
  - IL-IN
  - IN-OH
  - IL-OH
  - IL-WI
  - IL-IA
  - IN-MI
  - OH-MI
- User can edit prompt format:
  - `IL 32, IN 151`
  - `IL:32 IN:151`
  - `32 IL, 151 IN`
- Saves:
  - manualMiles
  - manualMilesByState
  - manualMilesState (largest state)
  - manualMilesSuggestion

Validation:
- npm ci passed
- npm run build passed
- npm run test:offline passed
- verify-deep-scan-v952 passed with 10 checks
