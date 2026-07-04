# PATCH V95.13 — Motive-Style Clean Corners

Base: v95.12 straight corners / no edge protrusions.

Problem:
- The previous graph still used a dark vertical connector under colored horizontal segments.
- This created visible edge/stub artifacts at corners.

Fix:
- Replaced the dark-connector + colored-overlay model with per-event H/V SVG paths.
- Each status segment owns its own bend and horizontal run.
- Same stroke width for horizontal and vertical sections.
- Butt caps + miter joins create clean square 90-degree corners.
- Removed separate dark vertical connector and square bridge caps.
- Removed edit-mode full-height guide lines.

No logic changes:
- Timeline untouched.
- HOS untouched.
- Sign/DOT/inspection/route legs untouched.
