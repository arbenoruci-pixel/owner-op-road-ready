# Modular Architecture

## Core
Platform-independent business logic.

- `core/timeline`: insert/edit/delete override behavior, carryover, display timeline
- `core/hos`: HOS/rules engine and violation ranges
- `core/gps`: location helpers and state-mile math
- `core/events`: event schema/factory

## Modules
UI feature areas.

- `modules/home`
- `modules/logbook`
- `modules/graph`
- `modules/editor`
- `modules/gps`
- `modules/equipment`
- `modules/status`
- `modules/dot`

## Shared
Reusable UI/utilities.

- `shared/ui`
- `shared/utils`

## Rule
UI may call core functions. Core must not import UI.
