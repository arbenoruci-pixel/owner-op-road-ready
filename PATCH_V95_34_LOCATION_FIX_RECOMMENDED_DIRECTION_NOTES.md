# PATCH V95.34 — Location Fix Recommended Direction

Base: v95.33 focused fix wizard UI.

Problem:
- For a jump like OFF Chicago -> ON Pre-trip Gary, the old default fix set the ON event to Chicago.
- That removed the warning but could make the log wrong.
- In this kind of case, the earlier OFF/SB/ON chain often needs to match the pre-trip/driving start location.

Changes:
- Location continuity issues now carry recommended fix direction.
- If the current event is ON duty / pre-trip, the wizard highlights the previous location as likely wrong.
- Fix it default now recommends:
  - set earlier connected event(s) to the current/pre-trip/driving location.
- If Pre-trip and first DRIVING locations mismatch, DOT Check now catches that too.
- In that case Fix it can update the pre-trip and connected prior non-driving chain to the driving start location.
- Alternate option still exists:
  - set current event to previous location.
- User can still type City, ST manually.

Validation:
- npm ci passed.
- npm run build passed.
- npm run test:offline passed.
- verify-deep-scan-v952 passed.
