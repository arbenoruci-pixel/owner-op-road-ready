# PATCH V95.10 — Slimmer Vertical Bends + Clean Joins

Base: v95.9 sign fallback / thinner bends.

Changes:
- Made duty-line vertical status-change bends another 15% thinner.
  - horizontal duty line remains 8px
  - vertical bend is now 5.78px
- Removed colored horizontal corner inset so the colored status line reaches the bend cleanly.
- This removes the visible dark/gap edge at status-change joins and makes the duty trace look more connected.
- Kept grid thinning, warning underlay, sign fallback, and manual miles fixes from prior patches.
- No timeline, HOS, sign validation, DOT, route-leg, inspection, or sync logic changed.

Validation:
- npm run build passed.
- npm run test:offline passed.
- v95.2 deep scan verification passed.
