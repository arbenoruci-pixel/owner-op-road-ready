# PATCH v95.85 — DOT Package Document Full-Screen Viewer

## Purpose
Make Roadside Documents inside the DOT Inspection Log Package open reliably when the package is shared as an HTML file.

## What changed
- Updated `source/src/modules/dot/DotMode.jsx`.
- Roadside document rows in the exported DOT HTML package now use a full-screen in-page viewer instead of relying only on opening raw `data:` document links.
- Added a large `‹ Back` control so an officer can return to the log package easily.
- Image documents open as full-screen previews.
- PDF documents open in a full-screen iframe preview when the browser supports it.
- Unsupported file types show a clean fallback with an `Open` action.
- The Roadside Documents table can now be tapped by row or by the Open button.
- The HTML package still embeds the saved document files; it does not require internet access.
- Added full-screen styling for the in-app DOT document viewer so the same officer-facing document viewer is easier to use on iPhone/PWA.

## Not changed
- No duty event start/end times changed.
- No driving event start/end times changed.
- No statuses changed.
- No HOS calculations changed.
- No route/load metadata changed.
- No miles/signing/backup/import logic changed.
- No GPS behavior changed.

## Files changed
- `source/src/modules/dot/DotMode.jsx`
- `source/src/styles.css`
- version metadata files
- verifier scripts

## Safety notes
The source of truth remains the saved wallet document data URLs and the existing duty events. This patch only improves how saved document files are presented/opened in DOT mode and in exported DOT HTML packages.
