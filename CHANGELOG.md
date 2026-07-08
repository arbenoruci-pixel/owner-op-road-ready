# v95.79 — Rest-Only Coverage Clean

- Treats OFF DUTY/SLEEPER-only restored days as full rest/off-duty coverage for DOT Check/signing.
- Prevents one-minute imported OFF/SB artifacts from opening a missing-coverage Fix Wizard on old off-duty days.
- Keeps true missing coverage checks active for driving/ON DUTY working days.
- Added verifier for the real backup Jun 29 / Jun 30 rest-only days.

# v95.78 — Quiet DOT Review Items

- Hid non-actionable rest progress review cards from the main DOT Check panel.
- Prevented later pre-trip events from being compared against earlier driving segments.
- Suppressed completed-inspection link metadata noise in the main DOT Check.
- Removed non-fatal delivery route-link review cards from the main DOT Check.
- Added verifier for the real backup Jul 05 noisy-review case.

# v95.77 — Off Duty No Shipping Docs Fix

- Fixed Sign/Fix Wizard requiring shipping documents on OFF DUTY/SLEEPER-only days.
- Missing shipping docs now applies only when a day has driving, loaded route work, or ON DUTY load-work text.
- No driving event times, duty statuses, miles, route legs, or backup data changed.

