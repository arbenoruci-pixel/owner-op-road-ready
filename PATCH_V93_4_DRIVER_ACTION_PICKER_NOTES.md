# Patch v93.4 — Driver Action Picker

Scope: Change Duty Status screen only. Built on v93.3 start-gap/thinner-line patch.

Changes:
- Redesigned `Change duty status` as a compact driver action picker.
- Header changed to compact `Change Status` with current location context.
- Primary focus is now status + action/reason.
- OFF/SB/D/ON buttons are shorter and more readable.
- Reason/action choices are contextual per selected status and wrap in a compact grid instead of horizontal overflow.
- Personal Conveyance remains under OFF; Yard Move remains under D.
- Location row is compact with GPS and Clear controls.
- Notes are collapsed behind `+ Add note optional` until needed.
- Save button remains sticky with safe-area spacing.

Preserved:
- Timeline/no-gap logic.
- RoadGuard/SignGuard logic.
- DOT package logic.
- Inspection/pre-trip linkage.
- ChatGPT fix-plan parser.
- Existing routes.
- Offline sync behavior.

Validation:
- `npm run build` passed.
- `npm run test:offline` passed.
