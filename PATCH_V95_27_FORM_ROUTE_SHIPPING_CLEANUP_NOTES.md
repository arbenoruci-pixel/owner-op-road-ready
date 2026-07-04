# PATCH V95.27 — Form Route / Shipping Cleanup

Base: v95.26 DOT miles speed guide popup.

Problem from field screenshot:
- Shipping Documents could look duplicated/truncated after multiple route legs.
- Route legs were correct, but the old fallback From/To rows still showed a confusing day-level route such as Chicago -> Chicago.
- Notes pulled event notes such as BOL / Pre-trip into the Form tab.
- Tapping an existing route leg opened Add Leg instead of editing that leg.
- Adding a route leg overwrote day-level loadInfo fields.

Fix:
- When route legs exist, Shipping Documents is derived from unique route-leg BOLs only.
- Day-level From/To rows are hidden when Route / Shipping legs exist.
- Form Notes no longer pulls duty-event notes.
- Existing route-leg rows open an edit prompt for that leg.
- Adding route legs updates only routeLegsByDay and does not overwrite loadInfo pickup/delivery/shipping fields.
- City/state display is cleaned up for capitalization.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- verify-deep-scan-v952 passed.
