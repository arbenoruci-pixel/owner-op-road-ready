# PATCH V95.31 — Smart DOT Officer Logic

Base: v95.30 pre-trip DOT detection.

Goal:
- Continue the same pattern as the 15m pre-trip fix:
  Detect the specific DOT-style problem, show the problem day, and route the driver to the exact fix/review area.

Added checks:
1. Location continuity
   - Detects status transitions where location changes with no driving event between them.
   - Example: SLEEPER Chicago, IL -> ON DUTY Waukesha, WI at the same minute.
   - Routes to the event for review.

2. Pre-trip order
   - Detects if ON DUTY Pre-trip overlaps/ends after first DRIVING starts.
   - Routes to the pre-trip event.

3. Inspection link review
   - Detects when an inspection is complete but not linked to the ON DUTY Pre-trip event.
   - Routes to Inspection tab.

4. Previous day unsigned
   - Adds complete-but-unsigned previous days to the DOT package issues.
   - Routes to that day.

Kept:
- Existing ADD_PRETRIP_BEFORE_DRIVING one-tap 15m fix.
- Existing form/route cleanup.
- Existing total miles only speed guide.
- Existing previous missing day flow.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- verify-deep-scan-v952 passed.
