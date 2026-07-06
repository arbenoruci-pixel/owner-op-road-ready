# Patch v95.69 — Intermodal Day Chassis Form

## Purpose
When the Form tab is opened for an intermodal/container day, the equipment row must show the chassis used on that log day instead of falling back to the saved dry-van trailer default (`Trailer 53`).

## Driver-facing behavior
- Intermodal days show `Chassis` on the Form tab.
- The value is the day-level chassis list from route legs, drop/hook data, current intermodal equipment, and event notes when available.
- Multiple chassis are listed once, for example: `UPHZ 531029 · DDRZ959762`.
- Dry Van / Reefer / Flatbed / Power Only days still show the regular trailer number.
- Bobtail/no-trailer behavior is unchanged.

## Safety rules
- Does not change duty-status events.
- Does not change DRIVING events.
- Does not change event times.
- Does not change manual miles or route legs.
- Only changes Form/Home/DOT/signing display fallback for intermodal equipment.

## Files changed
- `source/src/modules/logbook/DayLogScreen.jsx`
  - Adds intermodal day detection.
  - Adds chassis extraction from route legs and Drop & Hook notes.
  - Changes Form row label from static `Trailers` to dynamic `Chassis` for intermodal days.
- `source/src/modules/home/HomeScreen.jsx`
  - Shows current chassis for intermodal instead of `No vehicle`/stale trailer fallback.
- `source/src/modules/dot/DotMode.jsx`
  - Shows intermodal chassis in DOT package trailer/equipment field.
- `source/src/modules/logbook/signing.js`
  - Uses intermodal chassis for trailer/equipment signing warning checks.
- Version files bumped to `95.69.0`.

## Verification
- `scripts/verify-intermodal-chassis-form-v9569.mjs`
- `npm run test:offline`
- prior critical verifiers retained.
