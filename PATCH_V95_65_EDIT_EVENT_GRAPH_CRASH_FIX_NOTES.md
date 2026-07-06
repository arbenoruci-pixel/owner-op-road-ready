# PATCH v95.65 — Edit Event Graph Crash Fix

## Issue
Tapping an event could crash the page and show the generic `This page couldn't load` screen.

## Root cause
`source/src/modules/graph/LogGraph.jsx` used `color(editable.status)` inside the edit-handle rendering path, but the `color` helper was not imported from `shared/utils/status.js`. The normal log graph did not hit this branch, but opening an event in the edit sheet enabled `editable && onEditTime`, which triggered `ReferenceError: color is not defined`.

## Fix
Imported `color` alongside `STATUS_ORDER`, `rowIndex`, and `soft`.

## Expected result
Tapping an event opens the Edit Duty Status sheet instead of crashing the app.

## Safety
No duty-status write logic, DOT logic, wallet, signing, update-safe, route/drop-hook, or storage behavior was changed.
