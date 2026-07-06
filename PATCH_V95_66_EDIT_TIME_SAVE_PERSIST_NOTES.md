# PATCH V95.66 — Edit Time Save Persist

## Issue
Editing a duty-status event start/end time could appear correct inside **Edit Duty Status**, but after tapping **Save** the Log screen still showed the old duration.

Example from field use:
- ON DUTY Pre-trip was edited from **4:12 AM–4:30 AM** to **4:12 AM–4:20 AM**.
- Edit screen showed **8m**.
- After Save, the Log list still showed **18m**, because the next linked event still started at the old boundary.

## Root cause
The save path updated only the edited raw event. The display timeline then carried that edited status forward until the next event's unchanged start time, so the UI looked like the edit did not persist.

## Fix
- Time edits now use `applyPatchWithNeighbors(...)`.
- If an event end time changes, the next adjacent event start is moved to the edited end time.
- If an event start time changes, the previous adjacent event end is moved to the edited start time.
- Edit preview uses the same linked-neighbor logic as Save.
- Raw events only are used for save; display/synthetic rows are not written.
- Signed/certified days still become **Needs Recertification** through the existing `markRecert` path.

## Acceptance case
Before:
```text
OFF 12:00–4:12
ON  4:12–4:30 Pre-trip
SB  4:30–...
```

Edit ON end to 4:20 and Save.

After:
```text
OFF 12:00–4:12
ON  4:12–4:20 Pre-trip
SB  4:20–...
```

The Log list and graph both show ON as **8m**.

## Verifier
Added:
```bash
node scripts/verify-edit-time-save-v9566.mjs
```
