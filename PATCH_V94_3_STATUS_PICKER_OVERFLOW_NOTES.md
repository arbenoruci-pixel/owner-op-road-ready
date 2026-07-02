# PATCH V94.3 — Status Picker Overflow Fix

Base: v94.2 home graph opens Log tab.

Problem fixed:
- Change Status screen could horizontally overflow on iPhone/Safari and shift off-screen.

Changes:
- Added hard overflow-x guards for the status picker page, header, body, cards, grids, location row, suggestions row, and save button.
- Forced status/reason/start-time grids to use minmax(0, 1fr) so long labels cannot push the page sideways.
- Kept location suggestions scrollable inside their own row instead of making the whole page scroll horizontally.
- Kept v94.2 graph tap fix and previous timeline/stop/midnight logic.

Validation:
- npm run build passed.
- npm run test:offline passed.
