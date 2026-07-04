# PATCH V95.11 — Visible Slim Bends + Join Fix

Base: v95.10 slim bends clean joins.

Problem:
- The vertical status-change bends still looked almost unchanged on iPhone.
- Dark vertical edges were still visible at the joins, making the line look interrupted.

Changes:
- Made vertical status-change bends visibly thinner:
  - horizontal duty line remains 8px
  - vertical bend is now 4.4px
- Added colored horizontal join overlap so status-color segments cover the dark bend edge at corners.
- This makes the join look connected/continuous instead of cut off.
- Slightly softened vertical bend opacity so it reads as a connector, not a heavy wall.
- No timeline, HOS, sign, DOT, route-leg, inspection, or sync logic changed.

Validation:
- npm run build passed.
- npm run test:offline passed.
- v95.2 deep scan verification passed.
