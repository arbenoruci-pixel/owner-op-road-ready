# Owner-Op Road Ready v95.74.0 — Log Route Normalization + Sign Fix

## Product intent

This patch keeps Owner-Op Road Ready as a simple smart paper RODS / ELD-exempt owner-operator logbook. It does not add GPS auto-driving, does not turn the app into a full ELD, and does not change driving event times or driving duty statuses during automatic repair or import normalization.

## Safety rule honored

DRIVING (`D`) events remain the true driver record. The new normalizers repair only metadata around the driver record: route/load links, shipping-doc display metadata, day coverage interpretation, stale location labels on non-driving events, equipment fields, day miles suggestions, and Sign/DOT check severity.

## What changed

### Canonical route source

- Added `source/src/core/routes/routeNormalization.js`.
- `state.routeLegsByDay` is now the canonical route-leg source.
- Legacy `state.loadInfo.routeLegsByDay` is merged into canonical `state.routeLegsByDay` when imported or loaded, then removed from `loadInfo`.
- Form, Sign, DOT Check, route display, backup export, and import normalization now read from the same canonical route source.

### Import/export normalization

- App startup/import normalization runs:
  - `normalizeRouteLegs(state)`
  - `normalizeLoadInfoFromRouteLegs(state)`
  - `normalizeDayCoverage(state)`
  - `normalizeIntermodalEquipment(state)`
  - `normalizeTransitionEvents(state)`
- Backup export now strips stale legacy route copies and emits canonical route metadata.

### Midnight coverage and cross-midnight rest

- Coverage checks now treat a previous-day 23:59/24:00 status as carrying to the new day when appropriate.
- If a prior OFF/SB status logically continues across midnight until the first real current-day event, checks derive a non-stored coverage block for `00:00 -> first event`.
- This fixes the false July 6 missing-coverage-at-midnight case without creating fake driving.
- HOS/rest checks now count OFF/SB rest that started before midnight and continued after midnight.

### Location continuity and stale labels

- Location checks are less brittle when coordinates are close, unknown, or route context explains the next stop.
- Stale non-driving location labels can be normalized from the linked route destination for display/check purposes.
- Location continuity issues are review/fixable items instead of fatal signing blockers unless the underlying record truly needs correction.

### Transition shipping documents

- Drop & Hook transition events can carry delivered and picked-up load references without being treated as duplicate shipping documents.
- New explicit transition metadata supports:
  - `deliveredLoadNo`
  - `pickedUpLoadNo`
  - `transitionLoadNos`
  - clean display like `Delivered 114RMB689 · Picked up 113NRH53Z`

### Intermodal workflow separation

- Drop & Hook: drops current equipment and hooks new equipment for a loaded next move. A new load/BOL is required.
- Drop Off: drops current equipment without hooking new equipment. It clears current equipment and does not create a new route leg.
- Hook Empty / Reposition: hooks equipment for an empty, return, reposition, or non-revenue move. It creates an `empty/reposition` route leg and does not reuse the prior load number.

### Form, Sign, DOT Check, and Officer view

- Intermodal Form display uses `Chassis` and day-used chassis values instead of generic `Trailer 53`.
- Day distance remains editable and can show a route-derived recommendation when miles are missing.
- Sign guard blocks only true fatal items. Review items such as stale location labels and expected transition docs do not hard-block signing.
- Today/current active day remains a notice and is not forced into the unsigned completed-days list.
- Officer view remains inspection-safe: driver review happens before Begin Inspection, while the officer package shows logs, documents, graphs, totals, and clean package data.

## Critical backup cases covered

- July 6 can derive OFF/SB rest coverage from midnight to 12:40 AM without storing a fake driving record.
- July 6 missing total miles can be suggested as 206 from canonical route legs until the driver enters it.
- July 5 keeps 291 miles and shows intermodal chassis values where captured.
- July 5/6 Drop & Hook transition docs are accepted as delivered/picked-up transition metadata.
- July 7 empty/reposition moves do not reuse `113NRH53Z` unless the driver explicitly enters a new reference.

## Version/update

- App version bumped from `95.73.0` to `95.74.0`.
- Service worker version string was bumped only for safe update metadata.
- No service-worker cache behavior was changed.

## Verification

New v95.74 verifiers were added for:

- `verify-route-single-source-v9574`
- `verify-midnight-coverage-carryover-v9574`
- `verify-transition-shipping-docs-not-duplicate-v9574`
- `verify-intermodal-dropoff-hookempty-v9574`
- `verify-sign-does-not-block-on-false-location-v9574`
- `verify-jul06-miles-suggestion-v9574`
- `verify-import-normalizes-legacy-route-data-v9574`
- `verify-driving-events-unchanged-v9574`
