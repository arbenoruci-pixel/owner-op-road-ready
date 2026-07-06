# PATCH V95.63 — Motive-Style Graph Readability

## Purpose
Make the RODS graph easier to read in the field. The previous graph still had too many colors and thick vertical overlays, so short status changes looked like dark bars and the line blended into the grid.

## Changes
- Graph now uses one clean blue duty trace, closer to Motive-style readability.
- Removed per-status colored graph overlays from the graph trace.
- Event-list badges still keep status colors; only the graph line is simplified.
- Duty line is drawn once as one continuous SVG path with a light white halo.
- Vertical bends use the same slim trace instead of thick black bars.
- Grid is lighter and tighter.
- Row labels, hour labels, and totals are smaller and cleaner.
- Short event markers are smaller, visible dots rather than large colored blocks.
- Warning bands are softer and sit under the line.

## Acceptance
- Driver can quickly see OFF / SB / D / ON movement without the line blending into grid.
- Graph looks more like a clean paper/RODS grid.
- No duty-status logic, DOT check, signing, wallet, update system, route, or storage logic changed.
