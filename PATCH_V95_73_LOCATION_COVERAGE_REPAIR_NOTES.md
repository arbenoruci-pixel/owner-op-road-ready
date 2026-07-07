# Patch v95.73 — Location + Coverage Repair

Fixes false Log Check blockers seen after July 6 intermodal logs.

## What changed

- Start-of-day coverage now honors previous-day carryover when the previous day ended at midnight with the same non-driving status. This prevents raw coverage from flagging a 38-minute start gap while the visible paper-log graph already shows OFF/SB coverage.
- Location continuity checks now use coordinates when available and do not flag city-label mismatches when the points are effectively the same place.
- A contiguous ON DUTY Pre-trip / Pickup / Drop & Hook / Drop Off event followed by a generic Driving Started event is treated as the same start location.
- Future driving starts inherit the immediately preceding connected ON DUTY location when no GPS coordinate is provided, preventing stale city labels like Maumee after a North Baltimore pickup.
- Does not change driving times, duty statuses, miles, routes, chassis/container data, DOT documents, or backup/import behavior.

## Why

The app was mixing raw stored events, display coverage, and stale/manual reverse-geocoded locations. This made Log Check block signing with false issues even though the graph/list represented the day correctly.
