# PATCH V95.30 — Pre-Trip DOT Detection + 15m Insert

Base: v95.29 day-aware fix wizard.

Problem:
- A log could have OFF -> DRIVING -> OFF with no ON DUTY Pre-trip event.
- Inspection could show Completed, but DOT/Sign review did not flag the missing ON DUTY pre-trip duty-status event.
- DOT Check/Fix Wizard did not offer the driver a direct way to add the 15 minute pre-trip before driving.

Changes:
- Signing validation now flags: Pre-trip ON DUTY event is missing.
- DOT Check Inspection section now flags: Pre-trip ON DUTY event missing.
- Action added: ADD_PRETRIP_BEFORE_DRIVING.
- Fix action adds a 15-minute ON DUTY Pre-trip Inspection immediately before the first DRIVING event.
- It uses the first DRIVING event location.
- It links/creates the inspection sheet from that pre-trip event.
- It opens the Log tab and selects the new pre-trip event.
- Existing OFF/SB segment before driving is split/reduced by the insert, preserving 24h coverage.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- verify-deep-scan-v952 passed.
