# PATCH V95.45 — Runtime Hotfix + Passive Row List Merge

Base: v95.43 manual driving mode / graph polish.

Reason:
- v95.44 changed global timeline normalization to merge OFF/SB rows.
- User reported app blank screen after deploying v95.44.
- This hotfix rolls back the global timeline change and applies the OFF/SB cleanup only in EventList display.

Changes:
- Restored v95.43 timeline behavior by using v95.43 as base.
- EventList now merges adjacent/touching OFF DUTY rows for display.
- EventList now merges adjacent/touching SLEEPER rows for display.
- ON DUTY remains separate so Pre-trip/Fuel/Pickup/Delivery stay visible.
- DRIVING behavior from v95.43 remains unchanged.
- package.json version updated to 95.45.0.

Validation:
- npm ci
- npm run build
- npm run test:offline
- verify-deep-scan-v952
