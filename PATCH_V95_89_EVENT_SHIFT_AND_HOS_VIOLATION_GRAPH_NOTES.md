# PATCH v95.89 — Event Shift and HOS Violation Graph

## Goal
Make event shifting easier for a driver on iPhone and show the exact HOS violation point directly on the paper-log graph.

## What changed

### Easy Select / Shift Events
- Added a clean `Select` entry on the Log tab action rail.
- In select mode, event rows show a checkbox and selected rows get a clear highlight.
- Graph taps toggle selected events while select mode is active.
- Added quick shift actions:
  - `1 hr earlier`
  - `1 hr later`
  - `Shift` for more choices
- Reworked the Shift sheet with clear wording:
  - `1 hr earlier`
  - `30 min earlier`
  - `15 min earlier`
  - `15 min later`
  - `30 min later`
  - `1 hr later`
- Added custom minutes + earlier/later controls.
- Preview shows old time → new time before applying.

### Safe raw event shift logic
- Added `shiftSelectedEventsForDay()` in `source/src/core/timeline/timelineEngine.js`.
- Shift uses raw stored events only.
- Shift never uses display/carry-forward/synthetic timeline rows as the write base.
- Selected contiguous blocks shift together.
- Immediate neighbor rows are adjusted so the day stays covered when possible.
- Non-selected rows are preserved and are not silently deleted.
- Non-contiguous selections are blocked with `Select one continuous block`.
- All-day selection uses duty-change mode: 12:00 AM and 12:00 AM stay fixed while internal duty changes move.
- Signed/certified days are marked `Needs Recertification` after shifting.

### HOS violation red graph line
- The graph now paints the actual duty-status line red from the exact violation minute.
- Supported graph violation ranges:
  - 11-hour drive limit
  - 14-hour shift/window limit
  - 30-minute break requirement after 8h driving
  - 70-hour cycle limit where available
  - overlaps/status mismatch ranges already emitted by HOS review
- The red trace follows the same status row as the real event.
- A small red label appears at the violation start, such as `14h`, `11h`, `Break`, or `70h`.
- Cross-midnight violations are clipped to the active day, so if the violation already exists at midnight the red line starts at 12:00 AM.
- Log Check issue rows show the exact start time and route to the related event/graph highlight.

## Safety
- No GPS auto-driving was added.
- No automatic driving events are created.
- No route/load/miles/signing/PDF package logic was changed except signed-day recertification after explicit shift edits.
- Existing duty and driving times are not changed unless the driver explicitly selects and shifts those events.
- No synthetic rows are saved.

## Files changed
- `source/src/core/timeline/timelineEngine.js`
- `source/src/core/hos/hosEngine.js`
- `source/src/modules/editor/ShiftSheet.jsx`
- `source/src/modules/logbook/DayLogScreen.jsx`
- `source/src/modules/logbook/EventList.jsx`
- `source/src/modules/logbook/LogCheckPanel.jsx`
- `source/src/modules/graph/LogGraph.jsx`
- `source/src/app/App.jsx`
- `source/src/styles.css`
- `package.json`
- `package-lock.json`
- `public/app-version.json`
- `public/sw.js`
- `source/src/core/update/appUpdate.js`

## Verifiers added
- `verify-shift-selected-block-later-v9589`
- `verify-shift-selected-block-earlier-v9589`
- `verify-shift-preserves-24h-coverage-v9589`
- `verify-shift-does-not-delete-unselected-events-v9589`
- `verify-shift-uses-raw-events-only-v9589`
- `verify-shift-signed-day-needs-recertification-v9589`
- `verify-shift-all-day-duty-change-mode-v9589`
- `verify-hos-violation-red-line-start-v9589`
- `verify-hos-violation-click-opens-exact-event-v9589`
- `verify-hos-cross-midnight-violation-red-line-v9589`
- `verify-driving-events-shift-only-when-selected-v9589`
- `verify-no-gps-auto-driving-v9589`
