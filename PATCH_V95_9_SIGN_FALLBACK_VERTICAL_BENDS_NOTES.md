# PATCH V95.9 — Sign Fallback + Thinner Vertical Bends

Base: v95.8 thinner vertical grid.

Fixes:
- Added SignatureErrorBoundary around Sign tab so a signature render problem cannot crash the whole page.
- Improved migration from older per-day signatureDataUrl storage:
  - if driverSignature is missing, the app migrates the first old saved day signature into driverSignature before compacting day signatures.
- Signature screen now also resolves saved signatures via signatureRef.
- Duty graph vertical status-change bends are 15% thinner than horizontal duty lines.
- Horizontal duty line remains 8px.
- Vertical status-change bend is 6.8px.
- Grid line thinning from v95.8 remains.
- No timeline, HOS, DOT, route-leg, inspection, or sign validation logic changed.

Validation:
- npm run build passed.
- npm run test:offline passed.
- v95.2 deep scan verification passed.
