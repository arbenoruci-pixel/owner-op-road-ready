# PATCH V95.21 — Clear Test Dates Button

Base: v95.20 merge continuous driving events.

Added a temporary test utility in Log Tools:
- Button: Clear test dates
- Location: Day screen top-right menu (...) -> Log Tools

It clears:
- all log dates/events
- certification statuses
- signatures by day
- inspections by day
- route/load test data
- GPS trip data
- selected event state

It preserves:
- driver/company profile settings
- truck/trailer/equipment settings
- current GPS/location if already available

Purpose:
- Start a fresh test quickly while the app is still in field testing.

Validation:
- npm ci passed
- npm run build passed
- npm run test:offline passed
- verify-deep-scan-v952 passed
