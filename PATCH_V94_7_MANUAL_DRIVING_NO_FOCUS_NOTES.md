# PATCH V94.7 — Manual Driving Does Not Open Focus Screen

Base: v94.6 Insert Event Multi-Reason Picker.

Problem fixed:
- Manually inserting a DRIVING event opened the full Driving Focus screen and trapped the driver there.

Changes:
- Driving Focus now opens only when `gpsTrip.status === active`.
- Manual inserted DRIVING events remain normal log events and do not open the focus/stop-driving overlay.
- GPS/motion driving still opens the focus screen.
- No timeline, insert, route-leg, DOT, inspection, RoadGuard, or signing logic changed.

Validation:
- npm run build passed.
- npm run test:offline passed.
