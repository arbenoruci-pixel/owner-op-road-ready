# PATCH V94.4 — Multi-stop route legs + carryover

Base: v94.3 status picker overflow fix.

Changes:
- Added routeLegsByDay state for multi-stop / multi-load days.
- ON DUTY Pickup / Loading creates a route leg linked to that pickup event.
- ON DUTY Delivery / Unloading closes the matching open route leg when possible.
- BOL / Shipping # and destination are stored on the linked route leg.
- Moving/editing a linked event syncs pickup/delivery timing on the route leg.
- Deleting a pickup event removes that route leg; deleting a delivery event reopens the leg.
- Form tab now has Route / Shipping list with multiple legs and + Add stop / leg.
- Completed legs stay on the day where they were completed.
- Only open/in-progress legs carry forward visually into the new day.
- Existing From / To remains as summary of first/last route leg.

Validation:
- npm run build passed.
- npm run test:offline passed.
