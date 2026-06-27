# Patch v92.0 — RoadGuard AI Assist / SignGuard Mobile UX

## Scope
No route changes. This patch improves the existing Sign tab / RoadGuard pre-sign workflow and keeps the app mobile-first for iPhone/Safari.

## Changes
- Renamed the pre-sign check UI to RoadGuard Check.
- Removed duplicated red/orange warning blocks below SignGuard.
- Reclassified active/current day as a neutral notice instead of a fix-required defect.
- Grouped previous 7-day DOT package issues into a compact table instead of large repeated cards.
- Added direct quick actions:
  - Apply saved profile
  - Add BOL / mark empty
  - Open DOT days
  - Open log / inspection / equipment as applicable
- Reduced repeated per-card ChatGPT buttons to small Copy actions.
- Added a collapsed Ask ChatGPT helper.
- Moved ChatGPT paste area into a bottom sheet so the keyboard does not cover the issue list.
- Added structured ChatGPT fix-plan parsing for FIX_ID / APP_ACTION / VALUE blocks.
- Added suggested fix cards with Apply/Open and Copy block actions.
- Added RoadGuard tab switching requests so quick actions can jump the user to Log/Form/Inspection.

## Safety / compliance behavior
- The app does not auto-change driving/on-duty/off-duty times from ChatGPT output.
- ChatGPT fix-plan actions only apply saved profile, carrier, main office, shipping docs, trailer status, or open the relevant day/section unless the driver confirms accurate information.
- HOS/violation items remain review-only unless the driver manually verifies the log.

## Validation
- npm ci completed.
- npm run build completed successfully.
- ZIP excludes node_modules and .next.
