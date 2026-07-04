# PATCH V95.16 — Color-Safe Graph Corners

Base: v95.15 corner overlay fix.

Problem:
- Status colors were mixed into the vertical bends.
- ON blue appeared inside Driving/neutral bends and made the graph look wrong.

Fix:
- Removed colored vertical transition overlays.
- Vertical bends are neutral/slate only and 15% thinner than horizontal duty rows.
- Status colors are horizontal-only again.
- Colored horizontal segments extend slightly into bends so the corners stay clean without full-height blue/green vertical bars.

No logic changes:
- Timeline untouched.
- HOS untouched.
- Sign untouched.
- DOT untouched.
- Route legs untouched.
- Inspection untouched.
