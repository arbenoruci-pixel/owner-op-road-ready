# Patch v92.8 — Override Cleanup / Stale Pre-trip Link Fix

## Purpose
Fix stale duty-event artifacts when a driver overrides/replaces an older event with a new event.

## Issue fixed
When an ON DUTY Pre-trip Inspection event was replaced/overridden by another status such as OFF DUTY, old notes like `Pre-trip inspection / Stopped / On Duty / New event` could remain attached to the new OFF DUTY event. This caused the graph/RoadGuard to flag red conflicts and could leave a stale inspection link.

## Changes
- Added status-based event sanitization before saving inserted/edited events.
- When a status changes, stale notes/descriptions from the previous status are cleared and replaced with the correct default note for the new duty status.
- Non-ON events cannot retain stale pre-trip/inspection linkage metadata.
- Editor status controls now clear incompatible notes immediately when the driver changes status.
- Insert/edit save flow now cleans stale `Pre-trip`, `On Duty`, `Driving`, `Sleeper`, and combined-note artifacts.
- Timeline normalization no longer blindly concatenates notes from same-status overlapping/touching events. It merges only compatible text, preventing stale old notes from being glued to new events.
- Existing auto pre-trip inspection reconciliation remains active: when the ON DUTY Pre-trip event is removed/replaced, the auto-linked inspection sheet is removed/invalidated.

## Safety behavior
- The app still does not auto-change actual driving/on-duty/off-duty times from AI or HOS review.
- Overrides remove stale metadata but preserve the driver's explicit current event status/time/location.
- HOS/time issues remain review-only.

## Validation
- `npm run build` passed.
- `npm run test:offline` passed.
- No route changes.
- No timeline no-gap logic removed.
- No `node_modules` or `.next` included in output ZIP.
