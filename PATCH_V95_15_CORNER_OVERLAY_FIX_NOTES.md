# PATCH V95.15 — Corner overlay fix

## What changed
- Kept the base horizontal trace at 8px.
- Made base vertical transitions 15% thinner than horizontals.
- Added status-color transition overlays for DRIVING and ON DUTY bends so corners render as clean solid joins instead of broken overlaps.
- Kept the tap targets and edit behavior unchanged.

## Files touched
- source/src/modules/graph/LogGraph.jsx
