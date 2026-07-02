# PATCH V94.6 — Insert Event Multi-Reason Picker

Base: v94.5 Insert Event Driver Flow.

Changes:
- Insert Events reason picker now supports selecting more than one reason/action.
- Example: ON DUTY can select both `Pre-trip inspection` and `Pickup / Loading`.
- Selected reasons are saved together in the event note as a combined action.
- Pickup/Delivery detection still works when combined with other ON DUTY actions.
- BOL / Shipping # and destination fields still appear when any selected reason includes Pickup/Delivery.
- Prevents clearing the last selected reason by accident.
- Adds a small checkmark on selected reasons.
- No timeline/override, DOT, signing, inspection, RoadGuard, or route changes.

Validation:
- npm run build passed.
- npm run test:offline passed.
