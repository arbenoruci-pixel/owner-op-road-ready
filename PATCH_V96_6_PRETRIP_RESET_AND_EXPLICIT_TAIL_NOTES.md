# Owner-Op Road Ready v96.6.0

## Pre-trip logic
- A new Pre-trip is required by the app only after a qualifying 10-hour or longer consecutive OFF DUTY / SLEEPER reset.
- OFF and SLEEPER segments may combine to reach the 10-hour threshold when they are continuous.
- Midnight alone never creates a new Pre-trip requirement.
- Continuous Driving across midnight remains one driving tour.
- Start Driving is blocked after a qualifying 10-hour reset until the driver records an ON DUTY Pre-trip event.
- The rule is shared by Status, Sign, and DOT Check.

## Explicit event-end edit
- Editing the last/current event to a specific past end time now keeps that exact saved end.
- The display no longer stretches an explicitly edited event back to the current time.
- The latest saved edit replaces the prior live tail rather than showing an older extension.
- One-minute live status stubs still extend visually to the current minute until the driver explicitly edits the end.
- The app does not invent a replacement duty status after the explicit end; any uncovered time remains visible for the driver to complete accurately.

## Route / BOL protection
- Exact Pickup / Loading event BOL and Going to behavior from v96.4 remains unchanged.
- Existing route/BOL regression verification runs during the production build.

## Verification
- `verify-pretrip-reset-and-tail-edit-v966.mjs`
- `verify-route-bol-event-link-v964.mjs`
- Vercel preview build completed successfully on the v96.6 branch.
