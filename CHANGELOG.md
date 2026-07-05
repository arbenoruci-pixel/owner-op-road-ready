## v95.54 — Duty Status Override Fix
- Fixed the ON DUTY Pre-trip -> DRIVING override bug: adding Driving after a short live ON Pre-trip no longer deletes or mutates the ON event.
- Added protectLiveTailFromInsert for manual/driver workflow inserts so a different-status insert cannot silently cover the day's last stored event and reach past it.
- Insert sheet default time now starts at NOW when an existing event overlaps the 15-minute backdate window, preventing silent backdating over a fresh status change.
- Driver workflow and motion write paths now commit raw stored events only and strip synthetic/carry-forward rows before saving.
- Added scripts/verify-duty-status-override-v9554.mjs. Offline sync, deep scan, continuous-line verifier, and duty override verifier passed; run next build before deploy.


## v95.6 — Continuous Duty Line Graph
- Duty-status trace is now one continuous SVG path (M/H/V, butt caps, miter joins): horizontals and vertical bends share the exact same 8px stroke, clean 90° corners.
- Removed transition endpoint dots, thin separate bend strokes, cap artifacts and double-rendered overlaps at status changes.
- Status colors kept via same-width horizontal overlays inset half a stroke at bends; corners stay one seamless neutral body.
- Selection is now a soft under-glow + row fill and never thickens or distorts the real line; start/end circles appear only in active edit mode.
- Short 1-minute events: single clean dot marker on the path's own dip — spike lines, duplicate markers and boundary masks removed.
- Violation overlays match line width with butt caps (no fattening); still no full-height guide lines.
- Added scripts/verify-continuous-line-v956.mjs (13 offline checks). Offline sync smoke test and deep-scan verifier passed; npm registry blocked so next build must run on deploy.


## v95.2 — Deep Scan Fix
- Fixed critical linked-HOS bug: reviewing/signing a past day extended today's open event to midnight, producing phantom drive/on-duty hours and false 11h/14h/30m/70h warnings. Today is now always treated as the open day (extends to now only).
- Removed the vertical dashed warning guide line from graph violation overlays; warnings stay as colored segment overlays on the duty line.
- Change Status: a late-resolving automatic GPS fix can no longer overwrite a manually typed/picked city/state; explicit Use GPS still applies.
- Added scripts/verify-deep-scan-v952.mjs (8 offline checks). Offline sync smoke test and esbuild bundle validation passed; npm registry blocked so next build must run on deploy.


## v93.3 — Start Gap Visual Fix + Thinner Graph Line
- Fixed Log tab start-of-day visual gap by forcing DayLogScreen to render from normalized display timeline and adding a defensive graph-level start-gap guard.
- Made duty-status graph line approximately 10% thinner.
- Build and offline sync smoke test passed.


## v93.1 - Day-Start No-Gap Coverage
- Fixed remaining graph gap before the first event of the day.
- Day display now bridges 00:00 to first event start using carry-forward coverage.
- Same-status bridge merges into a single clean row.
- Build and offline sync smoke test passed.


## v93.0 — Pro Log Clarity / Exact Cutoff Graph
- Expanded the Log graph into the available screen width and removed the extra instruction row.
- Changed graph rendering so adjacent events cut off exactly at the status-change minute.
- Added precise short-event markers for 1-minute events without visually stretching their duration.
- Tightened event rows for a cleaner, less cluttered Log screen.
- Verified build, offline smoke test, and OFF/ON/OFF split behavior.


## v92.9 — Log Timeline / Graph Usability Fix

- Fixed insert/edit/delete override to split continuous duty-status blocks correctly.
- Added clearer graph rendering for 1-minute duty events without changing real log time.
- Expanded graph grid usage inside the card and removed extra bottom whitespace in non-edit mode.
- Clamped Shift Selected Events inside the log day and fixed false cross-day preview messaging.
- Fixed bulk Shift button readability.
- Build and offline sync smoke test passed.


## v92.8 — Override Cleanup / Stale Pre-trip Link Fix
- Cleaned stale note/description artifacts when overriding an event with another status.
- Prevented old ON DUTY Pre-trip/inspection text from remaining on OFF DUTY or other replacement events.
- Prevented non-ON events from retaining pre-trip/inspection link metadata.
- Adjusted same-status merge behavior so old notes are not blindly concatenated into new events.
- Build and offline sync smoke test passed.


## v92.7 - RoadGuard Fix Wizard

- Added step-by-step RoadGuard Fix Wizard for fix-required items.
- Sign action now opens Fix Wizard when records need fixes, instead of leaving driver stuck.
- Safe fixes can apply profile/BOL info with confirmation; HOS/time issues remain review/open-only.
- Maintained no-gap timeline, DOT package, inspection, ChatGPT parser, offline sync, and route structure.

## v92.6 — DriverLine Original UI Redesign

- Added a compact original DriverLine UI pass for market testing.
- Reworked topbar, tabs, logs list, graph shell, event rows, form rows, Sign/RoadGuard, AI helper, inspection, and DOT Mode styling.
- Removed legacy reference-named runtime classes from React/CSS and replaced them with `road-*` class names.
- Form, Sign, and Inspection tabs no longer carry the full graph at the top, keeping those screens calmer.
- Preserved existing continuous timeline/no-gap, RoadGuard, DOT package, inspection/pre-trip, ChatGPT parser, offline/Dexie, and Supabase logic.
- Build and offline sync smoke test passed.


## v92.5 — Original Driver UI (brand differentiation)

Goal: make the look-and-feel clearly Owner-Op Road Ready and visually distinct, while
keeping the simple row-based driver workflow and every bit of compliance logic. This pass
is presentation-only (palette, header, tabs, chips, rows, graph styling). No routes, no
logic, no schema.

Original visual identity
- New palette: warm off-white surface (#f5f3ee), deep navy ink (#1b2435), calm blue accent
  (#2557c7), green = ready/driving (#2f9e60), amber = review (#d68a26), red = fix (#cf4b4b).
- Duty-status colors re-themed at the single source (`shared/utils/status.js`): OFF/SB read
  as graded steel-slate, D = green, ON = Road Ready blue. This re-colors the graph and every
  duty chip/badge consistently.

Header (was a centered dark bar)
- Day header is now deep navy with a left-aligned title and a 2px blue accent rule.
- Logs header is a light bar with a "Road Ready · Logs" wordmark + accent mark on the left
  and a "DOT Mode" pill on the right. No centered title, no red notification dot.

Tabs (was an underline)
- Log / Form / Sign / Inspection is now a rounded segmented/pill control; the active tab is a
  filled blue pill instead of an underline.

Logs list (was dot + chevron rows)
- Rows now use a left status rail (colored by duty status), a status chip, date, total, cert
  status, inspection status, and a real warning count badge (from `validateLogForSigning`).
  No checkbox/chevron list style. Today still shows a mini graph.

Graph
- Softer warm grid, navy rounded duty line, navy/muted labels. Geometry, totals, and the
  continuous-timeline math are unchanged.

Event list / Form / Sign / Inspection / DOT
- Event rows use a rounded duty chip (not a circle) and our spacing; the edit control is an
  outlined accent button.
- Form sections are subtle rounded containers with our section headers.
- Sign uses a compact card with an accent-bordered certification statement; the RoadGuard /
  Log Check panel keeps all its logic, restyled to our card identity.
- Inspection check tiles and prompt use our borders/greens.
- DOT Inspection Mode header/badge/buttons use the navy + blue identity.

Unchanged (logic preserved verbatim)
- Continuous no-gap timeline, RoadGuard/SignGuard, DOT previous-7-days package, ChatGPT
  fix-plan parser, inspection/pre-trip linkage, Dexie/Supabase/offline sync.
- `App.jsx`, Chrome.jsx, and all logic/core files are unchanged except `status.js` (hex values
  only) and `LogGraph.jsx` (grid/line color values only).


## v92.4 — Simple Driver UI (Logs list redesign)

Goal: replace the busy Aurora Home with a calm, row-based driver logbook list, without
touching any compliance logic. UI structure only; original visual identity (own colors,
type, spacing, chips). No new routes.

What changed
- Rewrote the Home screen (`source/src/modules/home/HomeScreen.jsx`) into a simple Logs list:
  - Dark header titled "Logs" + a compact "DOT" action button (opens DOT Inspection Mode).
  - Status strip: current duty status (colored marker + label + location) | current vehicle.
    Tapping the status cell opens the Status workflow (where Start Driving lives); tapping
    the vehicle cell opens equipment.
  - Soft "N logs need signing" attention row (only when unsigned > 0 → Unsigned Logs).
  - TODAY section: one compact day row + a small graph preview (continuous timeline).
  - LAST 14 DAYS section: compact rows (status marker, weekday + date, total + cert status,
    a small ✓ when certified or a soft "!" when a completed day still needs attention, chevron).
  - Single compact "DOT Inspection Mode" row at the bottom.
- Removed from Home: the hero/greeting block, the compliance grid, the quick tiles, the
  "today's log / maintenance / messages / recent logs" cards, the fake hardcoded bottom
  timer ("16:25 · Until cycle restart"), and the destructive data-reset behind the header
  hamburger. The driver now sees status → today → recent days → open day.
- Added a self-contained, namespaced CSS block (`lv-*`) at the end of `source/src/styles.css`.
  It reuses only the existing duty-status colors and introduces no `!important` and no
  changes to any existing selector, so other screens are visually untouched.

What was deliberately NOT changed (logic preserved verbatim)
- Continuous no-gap timeline, RoadGuard/SignGuard checks, DOT previous-7-days package,
  ChatGPT fix-plan parser, inspection/pre-trip linkage, Dexie/Supabase/offline sync.
- `source/src/app/App.jsx` and all other screens/sheets are unchanged. The Home screen
  keeps the exact same props contract (unused props are simply not read).
- Day Log (Log/Form/Sign/Inspection tabs) already uses the tab + row structure from the
  spec, so it was left intact in this step.


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

## v93.2 — Pro Log Readability
- Made the Log tab flatter, cleaner, and more readable.
- Expanded graph usability while keeping labels/totals visible.
- Removed visual overlap artifact that made OFF DUTY appear to continue through short ON DUTY segments.
- Compact event rows and Log Check display.
- Removed duplicate certification action from Log tab; Sign tab remains the certification path.


## v93.4 — Driver Action Picker
- Redesigned Change Duty Status as a compact driver action picker.
- Focused the screen on status + reason/action + location + save.
- Collapsed optional notes and fixed reason chips wrapping on mobile.
- Preserved timeline, RoadGuard, DOT, inspection, ChatGPT parser, and routes.
- Build and offline sync test passed.


## v95.53 — Compact Visible Graph
- Narrowed the log graph height so it takes less space on iPhone.
- Enlarged graph labels/totals so the grid is easier to read.
- Made the duty line slightly stronger and the grid clearer.
- Tightened the Today graph card spacing on the Home Logs screen.
- Preserved smart paper-log mode, raw DOT coverage validation, and no GPS/motion tracking.
