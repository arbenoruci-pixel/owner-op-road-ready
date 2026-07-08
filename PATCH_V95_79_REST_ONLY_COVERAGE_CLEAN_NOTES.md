# PATCH v95.79 — Rest-Only Coverage Clean

## Issue

Old OFF DUTY/SLEEPER-only days restored from backup could contain a tiny one-minute OFF/SB artifact. DOT Check treated the rest of the day as missing coverage and opened the Fix Wizard even though the day was simply off duty.

## Fix

- Added rest-only coverage handling in raw RODS coverage checks.
- If a day has only OFF DUTY/SLEEPER events and no ON DUTY/DRIVING work, DOT Check derives full-day rest/off-duty coverage for validation only.
- This does not write synthetic rows to the log and does not modify stored events.
- Real working/driving days still require complete 24-hour coverage.

## Safety

- No DRIVING event start time, end time, or duty status is changed.
- No route/load, miles, documents, signatures, or inspection data is changed.
- The fix only changes how DOT Check/signing interprets rest-only/off-duty days.

## Verifier

- `verify-rest-only-partial-day-no-coverage-fix-v9579.mjs`
