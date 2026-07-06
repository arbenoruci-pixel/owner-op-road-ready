
## v95.59 — DOT Roadside Package
- DOT Mode now shows an officer-ready Roadside Package.
- Added Package / Logs / Documents switch.
- Wallet docs are grouped and visible in DOT Mode with Open document actions.
- Printable/share DOT report includes Roadside Documents before daily log pages.
- No duty-status, signing, GPS, or coverage logic changed.

## v92.6 — DriverLine Original UI Redesign

- Added a compact original DriverLine UI pass for market testing.
- Reworked topbar, tabs, logs list, graph shell, event rows, form rows, Sign/RoadGuard, AI helper, inspection, and DOT Mode styling.
- Removed legacy reference-named runtime classes from React/CSS and replaced them with `road-*` class names.
- Form, Sign, and Inspection tabs no longer carry the full graph at the top, keeping those screens calmer.
- Preserved existing continuous timeline/no-gap, RoadGuard, DOT package, inspection/pre-trip, ChatGPT parser, offline/Dexie, and Supabase logic.
- Build and offline sync smoke test passed.

# CHANGELOG

## v95 - Completed-log signing flow
- Changed Unsigned Logs so it only counts completed DOT log days before today.
- Kept today's active log out of unsigned-signature requirements.
- Added reusable driver signature storage; once saved, future log signing is one tap.
- Added warning/confirmation before signing when inspection, vehicle/trailer information, active-day status, or HOS review items need attention.
- Added an Unsigned Logs review screen for completed days that need signature or recertification.
- Preserved existing signed-day recertification behavior when signed logs are edited.
- Kept HOS, GPS, timeline merge, carryover, DB, service worker/cache, routing root, and Vercel config unchanged.

## v94 - row-based form and finger signature
- Rebuilt the Day Log Form tab into a row-based paper form with GENERAL / CARRIER / OTHER sections and row-based fields.
- Added top-line duty totals for OFF / SB / D / ON in the Form tab.
- Replaced the old text-only signature area with a real finger-signature canvas in the Sign tab.
- Added clear-and-resign behavior while keeping signature save inside the existing per-day signature storage.
- Kept HOS, GPS, timeline merge, carryover, DB, service worker/cache, routing, and Vercel config unchanged.

## v92 - Inline graph move and smoother edges

### Changed
- Added inline Move controls to the selected event bar on the Day Log graph.
- Added live graph preview for selected-event movement using -15, -5, +5, and +15 minute nudges.
- Added warning feedback when previewed movement changes HOS warning/violation ranges.
- Replaced the bulky current-status / drive-tracking area under the graph with a compact graph action rail.
- Smoothed graph transition corners by rounding transition lines and adding rounded corner caps.
- Saved inline movement through the existing event update path so selected-event editing continues to use the existing merge behavior.

### Unchanged
- No HOS rule changes.
- No GPS logic changes.
- No timeline merge/carryover logic changes.
- No local/offline save behavior changes.
- No App/root routing changes.
- No DB schema changes.
- No service worker/cache changes.
- No Vercel config changes.

## v91 - Screenshot compact graph cleanup

### Changed
- Used the actual live editor render path from `source/src/modules/editor/EditEventSheet.jsx`, `source/src/modules/editor/InsertEditEventSheet.jsx`, `source/src/modules/editor/components/EditorGraphPanel.jsx`, `source/src/modules/graph/LogGraph.jsx`, and `source/src/styles.css`.
- Enlarged the log graph vertically by changing the SVG viewBox/layout instead of forcing a tall CSS box that left empty white space.
- Made grid/background lines thinner and lighter while keeping duty-status segments readable.
- Moved START / END grabber chips lower below the duty-status line and preserved large invisible touch targets.
- Tightened the editor header, duty-button area, graph wrapper, time controls, location card, save area, and optional note toggle.
- Kept Notes collapsed behind the existing compact Add note / Edit note control.

### Unchanged
- No HOS rule changes.
- No GPS logic changes.
- No timeline merge/carryover logic changes.
- No local/offline save behavior changes.
- No App/root routing changes.
- No DB schema changes.
- No service worker/cache changes.
- No Vercel config changes.

## v90 - Compact editor flow

- Duty buttons render above the graph.
- Graph comes before time/location/save.
- Lower duplicate status/preview cards removed.
- Notes collapsed behind Add note / Edit note.

## v93 - Narrow graph, signature form, inspection form
- Made the live graph display about 10% narrower so it no longer feels stretched edge-to-edge on iPhone.
- Added working compact Form / Sign / Inspection tab panels in the Day Log screen.
- Added persistent pre-trip inspection checklist state per log day; once all items are selected, they stay saved for that day.
- Added compact signature panel that signs/certifies the day and stores signature state in the existing local app state.
- Automatically marks pre-trip inspection complete when ON DUTY is saved with the Pre-trip inspection reason or when the pretrip-drive flow runs.
- Kept HOS, GPS, timeline merge, carryover, DB, service worker/cache, routing, and Vercel config unchanged.
