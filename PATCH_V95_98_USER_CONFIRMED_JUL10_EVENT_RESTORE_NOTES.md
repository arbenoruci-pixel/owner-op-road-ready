# v95.98 — User-confirmed Jul 10 event restore

This patch adds a narrow, one-time local repair for the Jul 10, 2026 timeline shown by the driver.

It activates only when the current Jul 10 log is visibly collapsed into a broad midnight DRIVING row and the expected Sleeper block is missing. It restores:

- 12:00 AM–1:20 AM — DRIVING — Youngstown, OH
- 1:20 AM–11:20 AM — SLEEPER — Cheshire, CT
- 11:20 AM–11:40 AM — ON DUTY — Cheshire, CT
- 11:40 AM–12:36 PM — DRIVING — Cheshire, CT
- 12:36 PM onward — ON DUTY / Pickup / Loading — East Hartford, CT

The corrupted rows are backed up locally before replacement. Any stale GPS trip is disabled so it cannot overwrite the repaired timeline again. The repair is idempotent and records a completion marker.
