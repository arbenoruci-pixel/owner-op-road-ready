# PATCH V95.17 — Sign Tab Runtime Fix

Base: v95.16 color-safe corners.

Problem:
- Opening Sign tab on previous/completed days could show the SignatureErrorBoundary fallback:
  "Signature screen had a problem."
- Root cause: `officerChecklistRows()` used `durLabel(total)` but DayLogScreen did not import `durLabel`.
- This only surfaced at runtime when DOT Officer Check rows were built for completed/past days.

Fix:
- Added missing `durLabel` import from `../../shared/utils/time.js`.
- Kept the signature error boundary as a safety net.
- No graph, timeline, HOS, DOT package, route-leg, inspection, or signing validation logic changed.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- node scripts/verify-deep-scan-v952.mjs passed.
