# PATCH V95.14 — Thin Verticals + Sharp Corners

Base: v95.13 motive-style corners.

Problem reported:
- Vertical bends became too thick.
- Colored bends looked wrong.
- Corners did not read like one sharp solid duty trace.

Fix:
- Restored a slimmer neutral vertical bend layer (`VERTICAL_LINE_W = 6.8`).
- Colored duty segments are horizontal-only again.
- Colored horizontals now extend over the vertical bend (`CORNER_OVERLAP`) so the corner reads sharp and continuous.
- Removed colored vertical bend ownership that caused blue/green edge artifacts.

Result:
- Verticals are visibly thinner than horizontals.
- Corners stay clean and sharp.
- OFF/SB/D/ON colors still show clearly on the duty row itself.

No logic changes:
- Timeline untouched
- HOS untouched
- Sign untouched
- Inspection untouched
- Route legs untouched
