# PATCH V95.29 — Day-Aware Fix Wizard

Base: v95.28 delete route leg button.

Problem:
- Fix Wizard showed an issue but did not clearly show which log date/day the problem belongs to.
- User needed to tap and open that exact day.

Changes:
- Every Fix Wizard step now shows:
  - Problem day: DAY LABEL + YYYY-MM-DD
- Wizard has an explicit Open day button.
- The day label inside the issue card is tappable.
- Issue cards in SignGuard also show a tappable day link.
- OPEN_DAY now supports target tab routing:
  - log
  - form
  - sign
  - inspection
- Copy action now builds the issue prompt using the issue’s target day.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- verify-deep-scan-v952 passed.
