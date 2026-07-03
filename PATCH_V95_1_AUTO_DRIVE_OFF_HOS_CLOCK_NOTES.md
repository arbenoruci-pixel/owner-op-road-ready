# PATCH V95.1 — Auto Drive Off + HOS Clock Fix

Base: v94.9 DOT Officer Check.

Changes:
- Disabled always-on automatic motion driving.
- The app no longer switches to DRIVING automatically just because phone GPS detects motion.
- Driver can still explicitly tap Start Driving + GPS or arm motion watch manually.
- Motion watch is off by default.
- If GPS driving is explicitly active and the truck stops, existing stop-to-ON DUTY logic remains.
- Driving Focus 11h clock now uses linked HOS drive-used calculation instead of resetting to 11:00 every new drive segment.
- No manual inserted DRIVING focus overlay.
- No DOT, inspection, route-leg, signing, or timeline override logic changed.

Validation:
- npm run build passed.
- npm run test:offline passed.
