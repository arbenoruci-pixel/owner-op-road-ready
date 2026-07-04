# PATCH V95.22 — Manual Miles Null Coordinate Fix

Base: v95.21 clear test dates button.

Problem:
- Manual miles suggestion could show impossible distance like 6,723.91 mi.
- Root cause: `Number(null)` became `0`, so a log location with null lat/lng was treated as coordinate `0,0`.
- The estimate then calculated from the Gulf of Guinea instead of using the city/state log location.

Fix:
- `pointFromLogLocation()` now requires real lat/lng values before using coordinates.
- Null/blank/0,0 coordinates fall back to city/state lookup.
- `estimatedRoadMiles()` rejects impossible >1,200 mile straight-line estimates.
- Added a regression check: Willowbrook, IL -> Indianapolis, IN must estimate as a normal Midwest trip, not thousands of miles.

Validation:
- npm ci passed
- npm run build passed
- npm run test:offline passed
- verify-deep-scan-v952 passed
