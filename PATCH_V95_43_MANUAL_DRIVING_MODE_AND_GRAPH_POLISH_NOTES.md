# PATCH V95.43 — Manual Driving Mode + Graph Polish

Base: v95.42 field-safety P0.

Changes:
- Selecting DRIVING from the Status workflow now opens a dedicated manual Driving Mode screen.
- Driving Mode is inspired by the Motive reference screenshots:
  - MANUAL DRIVING label
  - Single large ring by default
  - Toggle for four clocks: Break, Drive, Shift, Cycle
  - DRIVING status card with arrow
  - Stop driving action
  - Open Log action
- Driving status card opens the status workflow so the driver can stop/change status.
- Smart paper-log mode no longer requests GPS on app launch.
- Log graph visual polish:
  - thinner duty trace
  - softer dark base line
  - lighter grid/background
  - smaller row/axis labels

No changes:
- Automatic GPS/motion tracking remains disabled.
- DOT Check logic unchanged from v95.42.
- Raw compliance validation unchanged from v95.42.
- No state-mile breakdown added.

Validation:
- npm ci
- npm run build
- npm run test:offline
- verify-deep-scan-v952
