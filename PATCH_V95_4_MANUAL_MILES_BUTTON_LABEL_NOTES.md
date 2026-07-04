# PATCH V95.4 — Manual Miles Fix Button Label

Base: v95.3 manual driving miles fix.

Changes:
- Manual driving warning action now visibly says `Add miles` instead of generic `Fix`.
- The action still opens the manual miles prompt added in v95.3.
- Sign and missing-location warnings also use clearer labels.
- No HOS timing, DOT, route-leg, inspection, signing, or timeline logic changed.

Validation:
- npm run build passed.
- npm run test:offline passed.
- v95.2 deep scan verification passed.
