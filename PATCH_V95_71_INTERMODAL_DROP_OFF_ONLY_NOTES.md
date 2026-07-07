# v95.71 Intermodal Drop Off Only Workflow

Fixes the port/yard workflow where the driver drops a container/chassis without immediately hooking a new one.

## What changed
- Added ON DUTY reason: `Drop Off`.
- `Drop Off` shows the intermodal equipment panel but only requires dropped container/chassis.
- `Drop Off` does not require new container, new chassis, new BOL/load number, or going-to location.
- Saving `Drop Off` records an ON DUTY drop-only event, clears current intermodal equipment, and closes the current open route leg.
- Existing `Drop & Hook` behavior still requires the next container/chassis/going-to fields.
- Dry-van `Drop Trailer` remains separate.
- DOT document viewer and officer-safe package behavior are retained.

## Safety
- Does not touch driving events.
- Does not move, split, or recalculate true DRIVING time.
- Only changes ON DUTY equipment/drop metadata when the driver saves Drop Off.
