# PATCH V95.35 — Clean Event Edit Flow

Base: v95.34 location fix recommended direction.

User direction:
- Remove the big selected-event bar that shows Move / Edit / Void.
- Make the log screen feel more like a clean paper log.
- Tap event or graph segment should go straight to edit.

Changes:
- Removed SelectedEventBar from DayLogScreen.
- Graph segment tap now opens Edit Event directly.
- Event row tap now opens Edit Event directly.
- Event row Edit button still works.
- Main Log action rail is simplified:
  - Insert
  - Status
  - Drive
- Removed main Move button and bulk move strip from normal flow.
- Delete/Void remains inside the edit sheet only.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- verify-deep-scan-v952 passed.
