# PATCH V95.8 — Thinner Vertical Grid Lines

Base: v95.7 graph warning underlay.

Changes:
- Made vertical graph grid lines 15% thinner:
  - major vertical grid lines: 1px → 0.85px
  - minor vertical grid lines: 0.5px → 0.425px
- Kept continuous duty trace thickness unchanged.
- Kept warning underlay fix from v95.7.
- No timeline, HOS, insert/edit, sign, DOT, route-leg, inspection, or sync logic changed.

Validation:
- npm run build passed.
- npm run test:offline passed.
- v95.2 deep scan verification passed.
- v95.6 continuous line verification passed.
