# PATCH V95.20 — Merge Continuous Driving Events

Base: v95.19 log-location miles suggestion.

Problem:
- Motion/GPS/manual flows could create adjacent DRIVING rows such as:
  - 5:50 PM DRIVING 6m
  - 5:56 PM DRIVING 6h 4m
- The graph was one continuous driving line, but the event list still showed two rows.

Fix:
- Updated timeline normalization so touching/overlapping DRIVING rows merge into one continuous driving event even when note/source text differs.
- Preserves the start location of the driving status change.
- Carries/combines manual miles metadata if present.
- Other statuses still require compatible notes/descriptions before auto-merge, so stale Pre-trip/inspection notes do not get glued to unrelated ON/OFF/SB events.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- node scripts/verify-deep-scan-v952.mjs passed.
