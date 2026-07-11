# Patch v96.1.0 — Manual Driving Midnight + Sleeper Stop Fix

## Reported failure

A manual Driving status continued across midnight. At 12:51 AM the driver selected Sleeper in Hubbard, Ohio. The new day displayed synthetic OFF DUTY from 12:00 AM to 12:51 AM and saved the Sleeper row with the old Driving-start location, Youngstown, Ohio.

## Root cause

- Manual Driving rollover was incorrectly gated by an active legacy GPS trip.
- Display safety converted an uncovered previous-day Driving carryover to OFF DUTY.
- The status picker reused the current Driving row's start location when ending Driving.

## Fix

- Added `manualDrivingContinuity.js` to create a real stored Driving bridge only in an uncovered 00:00-to-next-change gap. Existing current-day rows always win.
- The prior day's final Driving row is closed at 24:00 and the new day's row starts at 00:00.
- `closeLastAndAddStatus()` reconciles midnight continuity before writing Sleeper/OFF/ON.
- Leaving Driving clears the old location and requests a fresh high-accuracy GPS fix. Saving remains blocked until a current City, ST is available or entered manually.
- Added an exact one-time repair for the confirmed 12:51 AM Sleeper event: Driving 00:00–00:51, Sleeper from 00:51 in Hubbard, OH. The original current-day rows are copied to a local safety backup first.

## Safety boundaries

- No motion/GPS event auto-creation was added.
- No historic event before the status-change time is deleted or replaced.
- The migration is exact, one-time, and idempotent.
- Day export/import, DOT HTML, HOS calculations, signing, and event movement remain unchanged.
