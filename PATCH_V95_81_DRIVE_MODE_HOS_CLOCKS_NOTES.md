# PATCH v95.81 — Drive Mode HOS Clocks

## What changed

- Added a clean Drive Mode screen that opens when the driver manually changes current status to `DRIVING`.
- Added four large advisory HOS clocks in a Motive-like layout without copying branding:
  - `BREAK`
  - `DRIVE`
  - `SHIFT`
  - `CYCLE`
- Added a bottom status pill: `D  DRIVING  >`.
- Added light/disabled `Show Split SB Clocks` text. Split sleeper clocks remain disabled because the Drive Mode UI does not yet expose fully verified paired-period split logic.
- Added compact advisory HOS clocks to the home screen for non-full-screen review.
- Added minute-by-minute Drive Mode clock refresh.

## HOS calculation

- Added pure deterministic function:
  - `calculateHosClocks(state, now)`
- Added formatter:
  - `formatHosClockMinutes(minutes)`
- The calculation reads manual duty-status events across days from `eventsByDay`.
- Source of truth remains duty events.
- Derived HOS clock values are not stored as permanent truth.

## Rules covered

- 11-hour drive clock:
  - Counts cumulative `DRIVING` since the last qualifying 10 consecutive hours `OFF`/`SB`.
  - Does not reset at midnight.
  - Does not reset after short breaks.
  - Resets only after a real 10-hour `OFF`/`SB` reset.

- 14-hour shift clock:
  - Starts at first `ON`/`DRIVING` after a qualifying 10-hour reset.
  - Runs as a consecutive clock.
  - Does not reset at midnight.
  - Off-duty breaks do not extend the window in Drive Mode because split sleeper is disabled there.

- 30-minute break clock:
  - Tracks cumulative driving since the last qualifying 30-minute non-driving interruption.
  - Allows `OFF`, `SB`, `ON not driving`, or contiguous combinations totaling 30 minutes.
  - Does not reset at midnight.
  - A short 15-minute stop does not reset the break clock.

- Cycle clock:
  - Defaults to 70 hours / 8 days.
  - Supports 60 hours / 7 days through existing/settings-style cycle fields when present.
  - Counts `ON` + `DRIVING` in the rolling cycle window.
  - Applies a 34-hour restart after 34 consecutive hours `OFF`/`SB`.
  - Does not reset at midnight.

## Smart paper RODS / ELD-exempt guardrails

- No GPS auto-driving was added.
- Existing GPS motion event creation is disabled/no-op in smart paper mode.
- Drive Mode uses manual duty-status events only.
- No automatic driving events are created.
- No existing driving event start/end times are changed by the HOS calculator or Drive Mode screen.
- Route/load metadata and signing storage structures are unchanged.

## Files added

- `source/src/modules/drive/DriveModeScreen.jsx`
- `source/src/modules/drive/HosCompactClocks.jsx`
- `PATCH_V95_81_DRIVE_MODE_HOS_CLOCKS_NOTES.md`
- HOS/Drive Mode verifier scripts under `scripts/`.

## Files changed

- `source/src/core/hos/hosEngine.js`
- `source/src/app/App.jsx`
- `source/src/modules/home/HomeScreen.jsx`
- `source/src/modules/gps/DriveTrackerSheet.jsx`
- `source/src/styles.css`
- `package.json`
- `package-lock.json`
- `public/app-version.json`
- `source/src/core/update/appUpdate.js`

## Verifiers added

- `verify-hos-drive-clock-no-midnight-reset-v9581`
- `verify-hos-drive-clock-resets-after-10h-off-v9581`
- `verify-hos-shift-clock-no-midnight-reset-v9581`
- `verify-hos-break-clock-30min-rule-v9581`
- `verify-hos-cycle-70hr-8day-v9581`
- `verify-hos-34hr-restart-v9581`
- `verify-drive-mode-opens-on-driving-v9581`
- `verify-drive-mode-recalculates-after-reopen-v9581`
- `verify-driving-events-unchanged-v9581`
- `verify-no-gps-auto-driving-v9581`
