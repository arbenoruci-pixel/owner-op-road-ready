# PATCH V95.28 — Delete Route Leg Button

Base: v95.27 form route/shipping cleanup.

Change:
- Added a Delete button beside every Route / Shipping leg in the Form tab.
- Delete confirms before removing the leg.
- Existing route leg tap still edits that leg.
- Delete only removes the selected leg from routeLegsByDay.
- It does not overwrite day-level loadInfo fields.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- verify-deep-scan-v952 passed.
