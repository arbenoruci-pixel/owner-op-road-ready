# PATCH V95.41 — PWA Home Screen + Deep Scan Prompt

Base: v95.40 simple DOT Check modal.

Changes:
- Added PWA manifest:
  - public/manifest.webmanifest
- Added app icons:
  - public/icon-192.png
  - public/icon-512.png
  - public/apple-touch-icon.png
  - public/favicon.svg
- Updated app/layout.jsx:
  - manifest metadata
  - apple web app metadata
  - theme color
  - viewport fit cover
  - iOS Add to Home Screen tags
- Added a full Pro deep-scan prompt:
  - DEEP_SCAN_PROMPT_OWNER_OP_ROAD_READY_V95_41.md

No app logic changes:
- DOT Check untouched.
- Logbook untouched.
- Sync/service worker untouched.
- Timeline/HOS untouched.
- UI behavior untouched except PWA metadata/icons.

Validation:
- npm ci
- npm run build
- npm run test:offline
- verify-deep-scan-v952
