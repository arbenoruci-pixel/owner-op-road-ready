# Patch v92.7 RoadGuard Fix Wizard

Goal: make RoadGuard/SignGuard problems actionable without overwhelming the driver.

Changes:
- Added a mobile bottom-sheet RoadGuard Fix Wizard.
- The Sign button now opens the wizard when fix-required items exist instead of being disabled with no next step.
- Wizard guides the driver one issue at a time with Step X of Y.
- Each step shows the issue, target area, safety note, and actions: Fix/Open, Skip, Copy.
- Safe profile fixes can be applied in-place from saved defaults.
- Shipping docs/BOL prompt can be completed from the wizard without leaving the workflow.
- HOS/time/violation items remain review-only and do not auto-change driving/on-duty/off-duty records.
- DOT previous-day items open the target day for review.
- Active/current day notice remains neutral: sign becomes available after the day is complete.
- Kept existing continuous timeline/no-gap, RoadGuard, DOT package, inspection/pre-trip, ChatGPT parser, offline sync, and routes unchanged.

Validation:
- npm run build: passed
- npm run test:offline: passed

Packaging:
- no-root ZIP
- no node_modules
- no .next
