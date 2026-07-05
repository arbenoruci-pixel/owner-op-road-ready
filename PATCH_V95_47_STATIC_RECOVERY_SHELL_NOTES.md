# PATCH V95.47 — Static Recovery Shell

Base: v95.43 manual driving mode + graph polish.

Purpose:
- Recover from the blank white screen caused by a bad cached build or damaged local test data.

Changes:
- Added a server-rendered static recovery panel in app/page.jsx.
- If client JavaScript does not boot within 1.8 seconds, the recovery panel appears instead of a blank page.
- Added `/?rrreset=1` hard reset flow that clears:
  - service workers
  - browser caches
  - Owner-Op IndexedDB database
  - old local cache cleanup flags
- RoadReadyClient now marks successful boot and hides recovery panel.
- Added React error boundary around App.
- Updated service worker to delete caches on install/activate.
- Version set to 95.47.0.

Validation:
- npm ci
- npm run build
- npm run test:offline
- verify-deep-scan-v952
