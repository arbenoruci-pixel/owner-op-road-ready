# PATCH V95.5 — Sign Crash Guard

Base: v95.4 manual miles add button.

Problem addressed:
- iPhone/Safari could show "This page couldn't load" after tapping Sign Log.

Changes:
- Signing now stores the signature image once in `driverSignature`.
- Per-day `signatureByDay` stores signed metadata plus `signatureRef:'driverSignature'` instead of duplicating the base64 image every day.
- Existing saved states are normalized to remove duplicate per-day `signatureDataUrl` values.
- DOT Mode now falls back to the global saved driver signature when a signed day uses `signatureRef:'driverSignature'`.
- Added try/catch guard around sign click and canvas export.
- Added inline error message instead of allowing a hard crash.
- Added `type="button"` to signature action buttons.
- No HOS, timeline, DOT package, route-leg, inspection, or sync logic changed.

Validation:
- npm run build passed.
- npm run test:offline passed.
- v95.2 deep scan verification passed.
