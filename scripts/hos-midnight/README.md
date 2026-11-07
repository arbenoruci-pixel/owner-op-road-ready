# HOS split sleeper continuity — 110.4.108

## Authorized scope

Arben reported that the same driving records gained a violation when the
calendar day ended. After reviewing the reproduced midnight change, he asked
to fix it on November 7, 2026. This change covers derived HOS calculations and
visible pending/limit guidance. It does not restore, import or rewrite driver
records, certify a day, change signatures, or change the DOT workflow.

## Behavior

Review qualifying split sleeper periods on a continuous timeline. Later
recorded rest can resolve the selected day's pairing, while selected-day
driving totals and violation locations remain within that day. A feasible
unfinished pair stays explicitly pending across midnight. Existing live-status
continuity is retained; manual bounded rests and explicitly saved ends do not
gain unrecorded rest time. Actual driving,
shift, break and cycle violations retain their separate checks.

The compact clock panel refreshes from the existing read-only clock hook and
shows the pending requirement or highest-priority limit warning. The build
installs this correction after the existing materializers, validates the exact
predecessor HOS source, and updates only the affected HOS module hash. The DOT
workflow lock remains unchanged.

## Regression evidence

Tests use synthetic records with the reported duty times and no customer
identity, coordinates, signature image or uploaded backup. They cover the
23:59/00:01 boundary, the 7h26 partner threshold, later full resets, independent
violations, and unchanged input records. Rendered component checks verify that
pending guidance and actual limit alerts are visible.

The older long-first pending fixture originally included an earlier 16h45
sleeper period. That earlier rest can be a completed partner under the current
guidance. The final-runtime fixture therefore starts at its first recorded
work period, with no earlier eligible partner. Every existing assertion,
including the 209-minute driving and 309-minute shift allowances, is retained.

## Rule references

- [FMCSA hours of service summary](https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations)
- [Pending second period at a roadside inspection](https://www.fmcsa.dot.gov/regulations/hours-service/what-if-driver-stopped-roadside-inspection-after-having-taken-only-one)
- [Pair selection and the 14-hour window](https://www.fmcsa.dot.gov/regulations/hours-service/how-are-split-sleeper-berth-rest-periods-used-determining-compliance-14)
- [Ten-hour rest including seven sleeper hours as a split partner, FAQ 22](https://www.fmcsa.dot.gov/regulations/hours-service/can-driver-pair-rest-period-10-consecutive-hours-includes-7-consecutive)
- [Three hours off duty paired with ten sleeper hours, revised FAQ 07](https://www.fmcsa.dot.gov/regulations/hours-service/if-driver-takes-3-hours-duty-and-then-10-consecutive-hours-sleeper-0)
