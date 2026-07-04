# PATCH V95.37 — Compact Edit Sheet

Base: v95.36 edit sheet switch event.

Problem:
- Edit Duty Status screen had too much vertical spacing.
- The bottom warning about Manual Driving/GPS miles should be removed.

Changes:
- Removed the Manual Driving / GPS miles warning from Edit Duty Status.
- Collapsed optional description field unless it already has content.
- Tightened spacing for:
  - Selected event time card
  - Start/end time card
  - Quick time buttons
  - Location card
  - Save button
  - Note row
  - Cancel button
- Save button is no longer sticky/huge inside the edit sheet; it stays in the normal flow.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- verify-deep-scan-v952 passed.
