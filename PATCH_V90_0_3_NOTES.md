# Owner-Op Road Ready — v90.0.3 Patch Notes

Focus: fix the first reported field issues and connect more of Phase 2 foundation without redesigning the UI.

## Included

- Installed Supabase browser auth bridge so the offline sync engine can get the current Supabase access token from an active session.
- Server-side driver bootstrap: API routes now auto-create `profiles` and `drivers` for a valid authenticated user if the driver row is missing.
- Added pull sync storage into IndexedDB for log days, duty events, documents, document links and inspections.
- Added `inspections` queue mutations so pre-trip completion can sync to Supabase.
- Added `supabase/migrations/004_operational_tables.sql` with:
  - `inspections`
  - `certification_events`
  - `gps_trips`
  - `gps_points`
  - `ifta_state_miles`
  - `fuel_receipts`
  - `audit_log`
- Fixed Edit Duty Status location behavior:
  - clear button
  - full select on tap/focus
  - GPS button now works on Edit Duty Status
  - GPS metadata is saved with the edited event
- Improved GPS city/state guessing with Wisconsin and common Midwest freight lanes.
- Pre-trip inspection now auto-completes from an `ON DUTY` event containing `Pre-trip` or `Inspection`.
- Inspection timestamp now follows the ON DUTY event time.
- Editing/moving/deleting the source ON DUTY Pre-trip event updates the inspection link automatically.
- Inspection tab now shows an auto-linked completion card instead of forcing the driver to tap every checklist item.

## Validation

- `npm run test:offline` passed.
- Full `next build` could not be executed in this sandbox because npm package downloads failed with `EAI_AGAIN` DNS/network errors. Vercel should run the build with registry access.
