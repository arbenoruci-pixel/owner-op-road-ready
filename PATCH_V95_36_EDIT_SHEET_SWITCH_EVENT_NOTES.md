# PATCH V95.36 — Edit Sheet Switch Event

Base: v95.35 clean event edit flow.

Problem:
- After opening Edit Duty Status for one event, the user was locked into that event.
- To edit another event, the user had to leave the edit sheet first.

Changes:
- In the Edit Duty Status sheet, tapping another graph segment switches the edit sheet to that event.
- If the current event has no unsaved changes, it switches immediately.
- If there are unsaved changes, it asks before discarding them.
- The sheet stays open, so the driver can move from event to event faster.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- verify-deep-scan-v952 passed.
