# PATCH V95.38 — Multi-Reason Status Chips

Base: v95.37 compact edit sheet.

Problem:
- Status Workflow allowed only one reason chip.
- Driver may need to log one ON DUTY event with multiple remarks, e.g.:
  - Pre-trip inspection + Pickup / Loading
  - Pre-trip inspection + Fuel
  - Pickup / Loading + Fuel

Changes:
- Reason chips are now multi-select.
- Selected chips show a check mark.
- UI says “select one or more.”
- The saved event note joins selected reasons with ` · `.
- Pre-trip auto-inspection still triggers because note includes Pre-trip.
- Pickup/Delivery load-link section opens when any selected reason needs load info.
- Route-leg logic still detects pickup/loading or delivery/unloading inside the combined reason.
- Drop Trailer / Drop & Hook / Yard Move / Personal Conveyance detection now works inside combined reason text too.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- verify-deep-scan-v952 passed.
