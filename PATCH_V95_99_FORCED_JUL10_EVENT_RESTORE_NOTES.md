# Patch v95.99.0 — Forced Jul 10 Event Restore

This patch fixes the failed v95.98 one-time repair for the user-confirmed July 10 timeline.

## Root cause

The v95.98 migration only restored the day when the saved rows matched one narrow corruption signature and only when July 10 was resolved as the current home-terminal day. Recovery fragments, a stale prior migration marker, or a timezone/day mismatch could skip the repair.

## Fix

- Always inspects `2026-07-10` during initial hydration.
- Restores the exact user-confirmed timeline even when the saved day contains extra fragments or an old v95.98 marker.
- Persists the repaired snapshot before first render.
- Runs a second one-shot post-hydration guard.
- Clears the stale `gpsTrip` object so the midnight Driving row cannot overwrite the repair again.
- Preserves the previous bad rows in both safety and repair backups.

## Restored timeline

- 12:00 AM–1:20 AM — Driving — Youngstown, OH
- 1:20 AM–11:20 AM — Sleeper Berth — Cheshire, CT
- 11:20 AM–11:40 AM — On Duty — Cheshire, CT
- 11:40 AM–12:36 PM — Driving — Cheshire, CT
- 12:36 PM onward — On Duty / Pickup / Loading — East Hartford, CT
