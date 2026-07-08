# PATCH v95.84 — Home Terminal Time Zone Settings

## Purpose
Set the default DOT log time zone to the carrier/home-terminal time zone and allow the driver to choose another time zone when needed.

## Default
- Default home-terminal time zone: `America/New_York`
- User-facing label: Eastern Time
- This matches MC871792 / Narta Express being tied to a New Jersey official carrier record.

## What changed
- Added central time-zone utility: `source/src/core/time/homeTerminalTime.js`
- Updated `localDayKey`, `isToday`, `lastNDays`, and `nowMin` to use configured home-terminal time instead of device-local time.
- Updated HOS clock calculation to derive `nowDay` and `nowMinute` from the configured home-terminal time zone.
- Updated active/open driving rollover to use home-terminal day/minute.
- Added Log Time Zone option in Log Tools.
- Added `TimeZoneSheet.jsx` with common zone presets and custom IANA time-zone input.
- Added visible active timezone labels on Home and Log Day screens.

## Safety guarantees
- Existing duty-event `startMin` and `endMin` values are not converted.
- Time-zone save does not rewrite `eventsByDay`.
- Driving events are unchanged.
- GPS auto-driving remains disabled.
- HOS logic remains event-derived; only the definition of "now" and "today" uses configured home-terminal time.

## Tests added
- `verify-home-terminal-timezone-et-default-v9584`
- `verify-custom-timezone-option-v9584`
- `verify-local-day-key-uses-home-terminal-v9584`
- `verify-now-min-uses-home-terminal-v9584`
- `verify-hos-no-device-timezone-v9584`
- `verify-log-day-does-not-shift-in-kosovo-device-time-v9584`
- `verify-existing-events-not-converted-v9584`
