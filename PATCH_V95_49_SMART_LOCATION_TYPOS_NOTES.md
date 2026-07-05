# PATCH V95.49 — Smart Location Typo Parser

Base: v95.48 rollback to v95.43 stable.

Problem:
- Driver typed `gery in` / `gary in`, but the app could keep fallback state like IL or save the city text incorrectly.
- Location parsing lived in multiple local components, so behavior differed between Status, Edit, Insert, Form, and DOT fix flows.

Fix:
- Added `parseSmartLocationText()` in `source/src/core/gps/locationService.js`.
- It handles:
  - missing comma: `gary in` -> `Gary, IN`
  - common typo: `gery in` -> `Gary, IN`
  - wrong fallback state: `gery in` with fallback IL still -> `Gary, IN`
  - known city correction: `gary il` -> `Gary, IN`
  - capitalization cleanup: `elgin il` -> `Elgin, IL`
- Wired the shared parser into:
  - `StatusWorkflowSheet.jsx`
  - `EditorLocationFields.jsx`
  - `InsertEditEventSheet.jsx`
  - `DayLogScreen.jsx`
  - `App.jsx`

No broad logic changes:
- No timeline/HOS/DOT rewrite.
- No runtime rollback code.
- No OFF/SB global merge.

Validation:
- npm ci
- npm run build
- npm run test:offline
- verify-deep-scan-v952
