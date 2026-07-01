# PATCH V94.2 — Home graph opens Log tab

Base: v94.1 driving stop / midnight split fix.

Changes:
- Fixed Logs home graph tap opening the wrong tab.
- Opening a day from the Logs list, Today row, or Today graph preview now forces the Day Log screen to the `Log` tab.
- This clears stale tab replay from older flows like Inspect/RoadGuard.
- No event timeline, override, DOT, inspection, or signing logic changes.

Validation:
- npm run build passed.
- npm run test:offline passed.
