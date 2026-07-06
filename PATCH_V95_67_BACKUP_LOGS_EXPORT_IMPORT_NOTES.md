# PATCH V95.67 — Backup Logs Export / Import

## Reason
The driver needed to export the real app data so logs can be reviewed outside the phone and restored if Safari/PWA storage is lost. The Tools sheet had DOT Wallet, Shift, Update, and Clear Test Dates, but no Backup Logs option.

## Fix
- Added **Backup Logs** card to Log Tools.
- Added Backup Logs screen.
- Export creates `road-ready-backup-YYYYMMDD-HHMMSS.json`.
- Backup includes:
  - eventsByDay
  - certifyStatus
  - signatureByDay
  - inspectionByDay
  - route/load data
  - current status/location
  - DOT wallet documents and attachment data
  - app version and summary
- Import validates JSON, shows summary, asks confirmation, normalizes restored state, saves it to IndexedDB, and returns to Logs.
- Manual export also writes a local emergency copy in localStorage.

## Files changed
- source/src/app/App.jsx
- source/src/shared/ui/ToolsSheet.jsx
- source/src/modules/backup/BackupLogsScreen.jsx
- source/src/styles.css
- source/src/core/update/appUpdate.js
- public/app-version.json
- package.json
- scripts/verify-backup-logs-v9567.mjs

## Acceptance
- Log Tools shows Backup Logs.
- Export downloads a JSON backup file.
- Import accepts the backup, shows counts, restores app state, and persists it locally.
- No duty status/timeline logic changed.
