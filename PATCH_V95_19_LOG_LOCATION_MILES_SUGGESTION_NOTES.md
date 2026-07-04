# PATCH V95.19 — Manual Miles From Log Locations

Base: v95.18 smart DOT officer check.

Change:
- Manual driving Add miles flow now looks at log locations and suggests miles.
- It tries GPS points first when available.
- If GPS points are not available, it uses the driving block start location and next logged stop/location.
- Example: DRIVING starts in Gary, IN and next OFF/SB/ON event is Hubbard, OH -> prompt suggests estimated miles from log locations.
- Added more Midwest lane city points to the local lookup list including Hubbard, Youngstown, Cleveland, Akron, Streetsboro, Elyria, Maumee, Hammond, Merrillville, and Portage.
- Stores suggestion metadata on the event:
  - manualMilesSource
  - manualMilesSuggestion
- Keeps driver confirmation/editing through the manual miles prompt.

No changes:
- No HOS rewrite.
- No timeline rewrite.
- No DOT/sign logic rewrite.
- No sync/storage schema change required.
