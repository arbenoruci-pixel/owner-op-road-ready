# v96.0 — Single-Day Export / Import

## What changed

- Added **Export / Import this day** to every open Log Day.
- Added the same action in the Log Tools menu.
- Export creates a small JSON file for only the selected log date.
- Import replaces only the currently open target day.
- The current target day is saved locally in `dayImportBackupByDay` before replacement.
- Importing into the same date restores certification, signature, inspection, route legs, and manual miles when present.
- Importing a file from a different date copies event times/locations into the target date, generates new event IDs, and clears certification/signature/inspection for safety.
- Importing into the current home-terminal day updates the live status/location from the final imported event and clears stale GPS trip state.
- Removed the hard-coded Jul 10 forced-restore lifecycle logic so future edits or imports are not overwritten.

## Safety

- No database schema changes.
- No service-worker behavior changes beyond the release version bump.
- Other log days, wallet documents, settings, and global app data stay unchanged during a single-day import.
- Full-app Backup Logs remains available separately.

## Validation

- Production build passed.
- Version synchronization passed.
- Single-day export/import verification passed.
- Driving history guard and midnight recovery tests passed.
- Multi-event earlier/later shift tests passed.
- Compact DOT HTML test passed.
- Offline sync smoke test passed.
