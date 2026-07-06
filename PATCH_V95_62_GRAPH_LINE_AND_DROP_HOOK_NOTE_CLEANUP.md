# PATCH V95.62 — Graph Line + Drop & Hook Note Cleanup

## Problem
- Graph transition lines were visually too heavy and blended badly with the grid on iPhone Safari.
- Existing Drop & Hook notes could still show placeholder wording such as `dropped New trailer` or `dropped No trailer`.

## Fix
- Added shared log text sanitizer for equipment placeholder labels.
- Sanitized notes/descriptions in `normalizeLogEvents`, `sanitizeDutyEventForStatus`, Event List, and DOT Mode display/report output.
- Drop & Hook note builder now writes real equipment numbers only. If no real dropped/hooked number exists, it writes `Equipment changed`.
- Graph uses lighter grid lines, a strong white halo, slimmer continuous bend trace, and clearer status-colored horizontals/dots.

## Expected behavior
- Driver/DOT view never shows `New trailer`, `Old trailer`, or `No trailer` as if it were a real dropped/hooked unit.
- Existing saved logs showing those placeholders are cleaned on load/display.
- Graph remains readable without thick black vertical bars hiding the duty line.

## Not changed
- No duty-time changes.
- No DOT/signing logic changes.
- No GPS/motion changes.
- No wallet/roadside package changes.
