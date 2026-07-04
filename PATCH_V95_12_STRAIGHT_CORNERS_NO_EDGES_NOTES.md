# PATCH V95.12 — Straight Corners / No Edge Protrusions

Base: v95.11 visible slim bends join fix.

Problem:
- Vertical connectors were slimmer, but the corners still showed small edge protrusions / interruptions.
- The bend did not read as one clean straight connection on iPhone zoom.

Fix:
- Kept the slimmer vertical connector.
- Added square bridge caps at both ends of each vertical status-change connector.
- Each bridge cap uses the same width as the horizontal duty trace, so the join now reads as a straight, continuous corner.
- This removes the visible little edge/stub artifacts at the corner transitions.

No changes:
- HOS logic unchanged.
- Sign flow unchanged.
- DOT / inspection / route / sync logic unchanged.
