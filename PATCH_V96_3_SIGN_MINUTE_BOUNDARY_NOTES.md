# v96.3.0 — Certification Minute-Boundary Fix

## Problem
A completed log could display a clean transition at 11:59 PM while the raw live-status row still ended at 12:00 AM. The signing validator read the raw row and treated the one-minute storage/rounding tail as an overlap, so certification stayed blocked even though the event list and 24-hour totals were correct.

## Fix
- Signing now canonicalizes only exact one-minute adjacent boundary artifacts before validation.
- Example normalized for signing: D 11:51 PM–12:00 AM followed by ON 11:59 PM–12:00 AM is evaluated as D 11:51 PM–11:59 PM and ON 11:59 PM–12:00 AM.
- Overlaps larger than one minute still block signing and require driver review.
- Shipping-document validation remains unchanged and valid event-level BOL values remain accepted.
- No duty-status times are rewritten in storage by this validation fix.

## Verification
- Production build passed.
- New minute-boundary certification regression test passed.
- BOL/sign-loop regression test passed.
- Historical-location, pickup details, GPS, day transfer, midnight driving, PWA update, and offline/sync tests passed.
