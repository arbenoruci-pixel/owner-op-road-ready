# PATCH v95.86 — HOS Effective Drive Mode Clock

## Purpose
Fix Drive Mode clock presentation when one HOS limiter is already expired.

The raw 11-hour drive clock can still have time remaining even when the driver cannot legally continue driving because the 14-hour shift window, 30-minute break requirement, or cycle clock is at zero. The previous Drive Mode showed the raw 11-hour DRIVE value as green, which looked wrong when SHIFT was already 00:00.

## Changes
- Preserved the raw 11-hour `hos.drive` calculation unchanged.
- Added `hos.effectiveDrive`, which represents legal drive time available right now.
- Drive Mode display clocks now use effective DRIVE time.
- Effective DRIVE is the minimum of:
  - raw 11-hour drive remaining
  - 14-hour shift remaining
  - 30-minute break remaining
  - cycle remaining
- If any blocker is expired, displayed DRIVE becomes `00:00` and red.
- Added blocker metadata: `limitedBy`, `blockers`, `blockerLabels`.
- Added a small helper line under DRIVE when raw 11-hour time exists but legal drive is blocked.
- Added clearer warning text: “No legal driving time…” when effective drive is blocked.

## Safety
- No duty events are edited.
- No driving events are edited.
- No duty statuses are changed.
- No route/load/miles/signing/backup/import logic changed.
- No GPS auto-driving added.
- HOS remains advisory and derived from manual duty-status events.

## Verifiers
- `verify-hos-drive-mode-effective-drive-blocked-by-shift-v9586`
- `verify-hos-drive-mode-effective-drive-blocked-by-break-v9586`
- Existing v95.81 HOS verifier suite.
