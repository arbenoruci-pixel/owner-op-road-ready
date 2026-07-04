# PATCH V95.33 — Focused Fix Wizard UI

Base: v95.32 location continuity quick fix.

Problem:
- Fix Wizard detected the issue correctly, but the issue message did not visually focus the exact mismatch.
- The main button said “Fix location” instead of the simpler “Fix it.”

Changes:
- Added a focused problem panel for location-continuity issues.
- It visually separates:
  - Previous event location
  - Current event location
- Current mismatched location is highlighted in red.
- Fix suggestions are shown directly in the card:
  - 1 = set current event to previous event location
  - 2 = set previous event to current event location
  - or type City, ST
- Main action button now says “Fix it” for this issue.
- Keeps existing quick-fix behavior from v95.32.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- verify-deep-scan-v952 passed.
