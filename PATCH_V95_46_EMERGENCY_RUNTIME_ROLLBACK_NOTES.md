# PATCH V95.46 — Emergency Runtime Rollback / Cache Breaker

Base: v95.43 manual driving mode + graph polish.

Purpose:
- v95.44/v95.45 caused a white screen for the user.
- This patch rolls back the risky passive-list merge and adds a root error boundary/cache breaker.

Changes:
- Base restored to v95.43 known-good behavior.
- Added RoadReadyErrorBoundary in app/road-ready-client.jsx.
- Added emergency reset screen if React crashes instead of a white page.
- Added one-time cache/service-worker cleanup for v95.44/v95.45 bad deploy.
- Added reset button that clears IndexedDB/caches/service workers and reloads if the app cannot open.
- package.json version updated to 95.46.0.

Intentionally not included:
- OFF/SB passive list merge. That caused instability and should be re-added later only after runtime testing.

Validation:
- npm ci
- npm run build
- npm run test:offline
- verify-deep-scan-v952
