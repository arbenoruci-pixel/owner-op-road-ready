# PATCH V95.7 — Graph Warning Underlay

Base: v95.6 continuous duty line graph.

Problem:
- Amber/red HOS/review overlays were drawn as a full stroke on top of the duty trace.
- This made the warning color look like a second duty line and it appeared to stop halfway at transitions.

Changes:
- Removed the thick warning line overlay from the graph.
- Warnings are now drawn as a subtle background band under the real duty trace.
- A small warning badge remains at the issue start minute.
- The continuous duty path remains the only real visible line body.
- No full-height vertical guide lines.
- No timeline, HOS, insert/edit, sign, DOT, route-leg, inspection, or sync logic changed.

Validation:
- npm run build passed.
- npm run test:offline passed.
- v95.2 deep scan verification passed.
- v95.6 continuous line verification passed.
