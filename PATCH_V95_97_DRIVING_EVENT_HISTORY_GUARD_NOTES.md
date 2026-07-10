# PATCH v95.97 — Driving Event History Guard + Recovery

## Incident
After entering/leaving manual Driving Mode, a stale legacy `gpsTrip.eventId` from an older day could be treated as an active cross-midnight GPS trip. The rollover path then inserted one DRIVING event from 12:00 AM through the current time using override semantics. That broad event could replace every valid OFF/SB/D/ON event already stored for today.

## Root cause
- `rolloverActiveDrivingIfNeeded()` preferred a stale GPS event day over the active manual log day.
- The rollover event was inserted with `insertManyOverride()`, allowing a midnight-to-now DRIVING row to cover and delete existing duty events.
- Manual live status changes used the device clock in one path instead of the configured home-terminal time.

## Fix
- A GPS rollover now requires a genuinely active GPS trip, an exact matching GPS-created DRIVING event, and a matching active source day.
- Stale/mismatched GPS sessions are marked stale and cannot alter duty events.
- Rollover can only fill a genuinely uncovered start-of-day gap. Existing events always win.
- Manual Start Driving / Stop / status transitions use a history-preserving transition that only replaces time from the new status start forward.
- Manual status changes now use the configured home-terminal day and minute.
- A per-day safety copy is stored immediately before each live status transition.

## Existing damaged-day recovery
On startup, the app detects the exact corruption signature: a GPS-rollover-tagged DRIVING row from midnight through approximately now, optionally followed by a short stop/status row. It attempts recovery from:
1. pre-update state,
2. the per-day safety copy,
3. IndexedDB duty-event revision history.

Recovered historical events are restored, then the actual live DRIVING tail and any short trailing stop status are reconstructed from the surviving boundaries. The stale GPS trip is disabled.

## Preserved
- Multi-event move behavior.
- HOS calculations and Drive Mode clock presentation.
- DOT HTML package and compression changes from v95.95/v95.96.
- Route/load, miles, signing, inspections, backup/import, and wallet data structures.

## Validation
- Production build passed.
- Home-terminal time verifier passed.
- Historical event preservation test passed using the reported Jul 10 sequence.
- Midnight GPS rollover overwrite guard passed.
- IndexedDB revision recovery test passed.
- Recovery with a trailing ON DUTY stop row passed.
- Shift, HOS, DOT HTML compact, version sync, and offline tests passed.
