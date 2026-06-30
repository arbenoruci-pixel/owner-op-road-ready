# PATCH V93.8 — Short Event Boundary + Home Graph Tap Fix

Base: v93.7 home graph tap patch.

Changes:
- Fixed graph click propagation so tapping the Today graph line opens the day instead of doing nothing.
- Added display-only boundary masks for very short events so OFF does not visually look like it continues through ON.
- 1-minute ON DUTY / Pre-trip events now render as a clear marker while the real duration remains 1 minute.
- Adjacent short OFF/ON/OFF segments remain true to the event list and are easier to see.
- No duty-event times, DOT logic, inspection logic, RoadGuard logic, or route files changed.
