
## v92.3 — Aurora Driver UI / Original Calm Design

- Rebuilt Home into a compact driver command center.
- Added an original Apple-like calm visual system distinct from Motive/KeepTruckin.
- Tightened Day Log, Sign/RoadGuard, DOT Mode, Form, Inspection, and editor UI.
- Kept continuous timeline, RoadGuard, DOT package, and AI Assist logic intact.
- Build/offline/easy-eyes tests pass.


## v92.3 — Orchard UI / Apple-inspired Calm Driver UX

- Rebuilt Home as a compact command center with current status, vehicle/today/DOT chips, quick actions, RoadGuard summary, and compact recent logs.
- Added a distinct Apple-inspired Orchard UI layer with translucent chrome, segmented tabs, softer cards, smaller buttons, and calmer colors.
- Restyled Day Log, event rows, Sign/RoadGuard, AI helper, DOT mode, forms, and inspection screens to reduce screen fatigue.
- Removed duplicate LogCheckPanel rendering from Day Log.
- Preserved continuous timeline/no-gap logic and RoadGuard validation behavior.
- Build, offline sync smoke test, and easy-eyes verification passed.


## v92.3 — Native Owner-Op UI Redesign
- Rebuilt Home into a compact RoadGuard command center.
- Added Apple-inspired native mobile visual system distinct from Motive-style layouts.
- Tightened Day Log, RoadGuard, AI helper, Form, Inspection, and DOT Mode spacing.
- Reduced oversized cards and long visible explanations.
- Preserved continuous no-gap timeline logic and RoadGuard safety checks.
- Build/offline/easy-eyes checks passed.



## v92.2.1 — Package Fix / Proper ZIP

- Repacked v92.2 Easy-Eyes / RoadGuard UI as a proper `.zip` file after uploaded artifact arrived without a `.zip` extension.
- Re-ran build and verification checks. No route changes and no timeline logic changes.

## v92.2 — Easy-Eyes / RoadGuard UI (compact, calm, professional)

- Visual-only redesign layer appended to `styles.css`: softer semantic palette
  (calm blue = action, muted red = urgent only, amber = review, neutral = info),
  tighter spacing, smaller type, calmer corners, finger-friendly compact buttons.
- Day Log: smaller Log Check card; neutral active-day marker; Certify button now
  looks unavailable (neutral `not-ready` state) until the log is ready, but still
  surfaces the block message on tap.
- Sign / RoadGuard: compact summary; one strong global "Copy Log for ChatGPT";
  per-issue copy de-emphasised; active-day sign button reads "Sign after day is
  complete" instead of a red error.
- DOT Mode, Form, Inspection, Home: compacted; iPhone safe-area spacing kept;
  reduced-motion respected.
- No logic, timeline, signing, compliance, or route changes. Verified with
  TypeScript syntax parse (0 errors), `test:easyeyes` (20/20), and `test:offline`.

## v92.1 — Continuous Timeline / No-Gap Logbook

- Fixed critical graph/timeline gap behavior: duty status now carries forward until the next duty-status change.
- Completed days render to midnight/end-of-day; active day renders to current time.
- RoadGuard, DOT Mode/report, Home preview, Form totals, SignGuard, and HOS review now use the continuous timeline.
- Status changes now close the previous raw event even if it ended early.
- Added review detection for conflicts like OFF DUTY with an “On Duty” note.
- Build and offline sync smoke test passed.

# v92.0 RoadGuard AI Assist / SignGuard Mobile UX

- Improved SignGuard into RoadGuard Check for cleaner mobile use.
- Removed duplicate warning blocks and made active day a neutral notice.
- Grouped previous 7-day DOT package issues into compact table.
- Added quick actions and collapsed ChatGPT helper with bottom-sheet paste flow.
- Added structured ChatGPT fix-plan parsing and suggested fix cards.
- Build passed with no route changes.


## v91.3 — SignGuard + Copy for ChatGPT Review
- Added Pre-Sign DOT Check / SignGuard panel on the Sign tab.
- Added copyable full log review prompt for ChatGPT.
- Added per-issue Copy for ChatGPT buttons.
- Added paste/copy area for ChatGPT fix plans while correcting logs.
- Improved sign validation for 24-hour coverage, required RODS fields, gaps, shipping docs, and previous 7-day DOT package readiness.
- Build passed.

# CHANGELOG



## v95 - Completed-log signing flow
- Changed Unsigned Logs so it only counts completed DOT log days before today.
- Kept today's active log out of unsigned-signature requirements.
- Added reusable driver signature storage; once saved, future log signing is one tap.
- Added warning/confirmation before signing when inspection, vehicle/trailer information, active-day status, or HOS review items need attention.
- Added an Unsigned Logs review screen for completed days that need signature or recertification.
- Preserved existing signed-day recertification behavior when signed logs are edited.
- Kept HOS, GPS, timeline merge, carryover, DB, service worker/cache, routing root, and Vercel config unchanged.

## v94 - Motive-style form and finger signature
- Rebuilt the Day Log Form tab into a Motive-style paper form with GENERAL / CARRIER / OTHER sections and row-based fields.
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
