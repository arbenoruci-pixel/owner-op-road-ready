# PATCH V95.39 — Custom Location Fix Modal

Base: v95.38 multi-reason status chips.

Problem:
- The native iPhone prompt could not make the two event locations bold/red.
- The two event locations blended into regular text.

Changes:
- Replaced the native location-fix prompt with a custom in-app modal.
- The two event locations are shown as separate cards.
- The likely wrong side is highlighted red and bold.
- The reference side is highlighted green.
- Main action: Fix it.
- Alternate action remains available.
- Custom City, ST input remains available.
- Existing smart direction logic from v95.34 is preserved.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- verify-deep-scan-v952 passed.
