# Owner-Op Road Ready v95.50 — DOT Coverage Wizard Patch

Target baseline: v95.43/v95.41 working app.

## What changed

- Added raw RODS compliance helper in `source/src/core/compliance/rawRodsChecks.js`.
- DOT Check and signing coverage validation now use raw stored events instead of graph/display synthetic timeline.
- Coverage issues are grouped into one `Missing log coverage` DOT issue with `Start Fix Wizard`.
- Start gaps, internal gaps, and end gaps become wizard missing blocks instead of separate main DOT cards.
- Daily total mismatch is shown inside coverage details when missing blocks exist.
- Added Coverage Fix Wizard in `DayLogScreen.jsx`:
  - Step-by-step missing block flow.
  - Status buttons: OFF / SB / ON / D.
  - City/ST and note inputs.
  - `Save and next`, `Skip`, `Cancel`.
  - Saved rows are real stored events with `source: 'coverage_fix_wizard'`.
- Wizard save path uses `rawStoredEventsForDay` + `insertManyOverride` + raw-only commit.
- Synthetic display fields are stripped before timeline commits.
- If a signed/certified day is edited by the wizard, the day becomes `Needs Recertification`.
- Previous 7-day package stays collapsed in the DOT modal.
- Added Create Missing Day modal for previous missing days:
  - Full OFF duty day.
  - Full Sleeper day.
  - Build manually.
- Previous-day package now detects missing, incomplete, unsigned, and needs recertification from raw coverage/sign state.
- Removed production seeding of mock previous logs unless `NEXT_PUBLIC_OWNER_OP_DEMO_DATA=true`.
- DOT Check miles issue is now one day-level `Total driving miles missing` card.
- Added detection for completed inspection with no linked ON DUTY Pre-trip.
- Tightened delivery route link review so a delivered leg does not falsely satisfy an unrelated delivery event.
- Stopped app startup from requesting GPS in smart paper-log mode.
- Restored graph continuous-duty-line verifier contract by rendering the base body as one continuous SVG path.
- Updated package version to `95.50.0`.

## Verification run

- `node scripts/verify-deep-scan-v952.mjs` — passed, 27 checks.
- `node scripts/verify-continuous-line-v956.mjs` — passed, 13 checks.
- `npm run test:offline` — passed.
- Source parse smoke with TypeScript transpile over 39 source files — passed.

`next build` was not run in the sandbox because `node_modules` is not installed in the uploaded zip workspace.
