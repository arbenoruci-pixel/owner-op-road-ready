# PATCH v95.60 — Drop & Hook Equipment Flow

## Goal
When the driver selects **ON DUTY → Drop & Hook**, the app must capture the equipment change and next load information immediately instead of saving a generic note.

## Fixed behavior
- Drop & Hook now opens a focused equipment section in the status sheet.
- Driver is asked for:
  - dropped container
  - dropped chassis
  - hooked/new container
  - hooked/new chassis
  - new BOL/load number
  - next destination
  - seal number optional
- Save is blocked until new container, new chassis, and next destination are entered.
- The ON DUTY event note records exactly what was dropped and hooked.
- Current equipment updates to the hooked container/chassis.
- Current load/shipping info updates to the new BOL and next destination.
- Route legs are updated:
  - old open leg is closed as delivered/dropped at the current location
  - new open leg is created from the drop/hook location to the next destination
- Route/shipping form now shows container/chassis and dropped equipment in the leg meta line.

## Protected areas
- No duty-status override logic changed.
- No GPS/motion tracking added.
- No DOT coverage wizard changes.
- No signing changes.
- No synthetic/display rows are introduced.

## Test
Added:
- `scripts/verify-drop-hook-equipment-v9560.mjs`

Passed:
- `npm run test:offline`
- `node scripts/verify-continuous-line-v956.mjs`
- `node scripts/verify-deep-scan-v952.mjs`
- `node scripts/verify-duty-status-override-v9554.mjs`
- `node scripts/verify-day-switch-driving-display-v9555.mjs`
- `node scripts/verify-sign-overlap-midnight-driving-v9556.mjs`
- `node scripts/verify-dot-wallet-v9557.mjs`
- `node scripts/verify-safe-update-v9558.mjs`
- `node scripts/verify-dot-roadside-package-v9559.mjs`
- `node scripts/verify-drop-hook-equipment-v9560.mjs`
