# Patch v93.0 — Pro Log Clarity / Exact Cutoff Graph

Purpose: make the Log screen cleaner and more usable for real iPhone/Safari testing while preserving all existing logbook logic.

Changes:
- Graph now uses more available horizontal width by reducing SVG left/right reserve and removing outer card padding in the Log tab.
- Removed the inline "Tap a line on the graph" explanation row to save screen space.
- Duty-status graph segments now draw from exact start minute to exact end minute with butt caps, so OFF DUTY does not visually continue past an ON DUTY event boundary.
- Very short events now render with a precise marker/dot at the true minute instead of stretching the segment into neighboring time.
- Transition lines are exact and compact, with no rounded horizontal overrun at status changes.
- Event list rows are tightened and row-based to fit more log information on screen without big cards or explanations.
- Kept RoadGuard, DOT, inspection, ChatGPT fix-plan parser, offline sync, and routes unchanged.

Validation:
- npm ci completed.
- npm run build passed.
- npm run test:offline passed.
- Manual timeline split smoke check passed: OFF 0-17, ON 17-18, OFF 18-66.

Packaging:
- no-root ZIP
- no node_modules
- no .next
