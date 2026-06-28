# Patch v92.3 — Orchard UI / Apple-inspired Calm Driver UX

Purpose: make the app feel like a new, distinct, calmer owner-operator driver tool instead of a Motive-like card prototype.

## Changed

- Rebuilt the Home screen into a compact command-center layout:
  - Current status hero
  - Vehicle / Today / DOT mini chips
  - One primary action
  - RoadGuard summary strip
  - Four compact quick actions
  - Compact Today log preview
  - Compact RoadGuard and recent-log lists
- Added a new Orchard UI visual layer:
  - iOS-style translucent headers
  - segmented pill tabs
  - softer surfaces and rounded controls
  - smaller text hierarchy
  - less red/blue noise
  - compact event cards
  - smaller action buttons
  - glass bottom status pill
- Redesigned Sign / RoadGuard styling:
  - more compact RoadGuard summary
  - shorter labels
  - issue cards with condensed text
  - AI helper shown as a compact tool
  - DOT days table kept compact
- Reduced screen fatigue:
  - less empty vertical space
  - fewer oversized cards
  - details are visually de-emphasized
  - most important action is easier to find
- Removed duplicate LogCheckPanel rendering from Day Log.

## Preserved

- Continuous timeline / no-gap display logic from v92.1.
- RoadGuard / SignGuard validation logic.
- DOT Mode / DOT report routes and data flow.
- ChatGPT copy/paste fix-plan workflow.
- No route changes.

## Validation

- npm run build: passed
- npm run test:offline: passed
- npm run test:easyeyes: passed
