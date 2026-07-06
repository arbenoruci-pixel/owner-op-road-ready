# PATCH V95.61 — Graph Visibility + Drop & Hook Wording / Adjacent Merge

## Goal
Make the log graph easier to read on iPhone and clean up Drop & Hook event wording so the log never says vague labels like "new trailer" or "old trailer". Also normalize back-to-back same-duty events into one continuous duty-status row.

## Fixes

### 1. Graph duty line readability
- Increased the main duty trace stroke.
- Added a white halo behind the duty path and each colored status segment.
- Lightened grid lines so the duty line stays visually above the grid.
- Increased short-event marker size and border.
- Kept warning bands under the duty line.

### 2. Adjacent same-status event merge
- `normalizeLogEvents()` now merges any touching/overlapping same-status duty events.
- ON DUTY Drop & Hook followed immediately by ON DUTY Pre-trip becomes one ON DUTY row.
- Notes/descriptions are combined uniquely with ` · `, so metadata remains visible:
  - `Drop & Hook ... · Pre-trip inspection`
- Graph shows one continuous ON segment.

### 3. Drop & Hook wording cleanup
- Removed generic wording such as `New trailer`, `New equipment`, and old/new language.
- Event notes now use actual equipment IDs only:
  - `dropped CONT123 / CHAS123`
  - `hooked CONT456 / CHAS456`
- If no real equipment label exists, the log says `equipment changed`, not `new trailer`.
- Trailer sheet placeholder changed to `Hooked trailer number`.

## Acceptance
- Graph lines are visible against the grid on iPhone.
- Back-to-back ON DUTY rows merge into a single row.
- Drop & Hook text does not say old/new trailer.
- Drop/hook equipment metadata and pre-trip note remain visible after merge.
