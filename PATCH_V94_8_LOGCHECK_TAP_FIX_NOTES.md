# PATCH V94.8 — Log Check Tap-to-Fix

Base: v94.7 manual driving no focus.

Changes:
- Log Check warnings are now actionable rows.
- Each warning gets a `Fix` / `Review` pill.
- Tapping a fixable issue opens the relevant event when possible.
- Tapping “Day is not certified” opens the Sign tab.
- Manual driving warning opens the first manual Driving event.
- Missing location warning opens the first event missing city/state.
- HOS warning ranges (14h, 11h, 30m break, 70h) select/open the related event for review.
- No timeline, HOS calculation, DOT, route-leg, inspection, or signing logic changed.

Validation:
- npm run build passed.
- npm run test:offline passed.
