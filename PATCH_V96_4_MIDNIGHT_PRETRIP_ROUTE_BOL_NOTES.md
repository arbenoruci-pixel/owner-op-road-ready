# Owner-Op Road Ready v96.4.0

## Midnight pre-trip continuity
- Detects the exact boundary where the previous log day ends in DRIVING at 24:00 and the current day begins in DRIVING at 00:00.
- Suppresses the false “Pre-trip ON DUTY event is missing” issue for that continuous driving segment.
- Applies the same rule in Sign validation and DOT Officer Check.
- Prevents the quick-fix action from inserting a false 15-minute pre-trip at midnight.
- Keeps the normal pre-trip review when the previous day did not end in DRIVING or the current Driving row starts after 00:00.

## Pickup route / BOL link
- The exact ON DUTY Pickup / Loading event owns its BOL and Going to values.
- Edit Event reopens those values from the event or its linked route leg.
- Explicit Form route edits synchronize BOL and destination back to the linked event.
- Event time and historical location are never changed by route/BOL synchronization.
- Event cards show BOL and Going to so the driver can confirm the saved route without opening Form.
- Sign and DOT checks read the same exact event/route data, avoiding a repeated “BOL missing” loop.

## Verification
- `verify-midnight-pretrip-continuity-v964.mjs`
- `verify-route-bol-event-link-v964.mjs`
- Existing BOL/signing, pickup editor, historical location, minute-boundary, midnight Driving, route, PWA update, and offline/sync checks.
