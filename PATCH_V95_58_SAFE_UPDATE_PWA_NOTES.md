# PATCH V95.58 — Safe Update PWA

Purpose: make Owner-Op Road Ready receive app updates safely like the Tepiha app workflow, without wiping or risking local log data.

## Added

- `public/app-version.json` as the no-cache remote version source.
- App update checker on load, online event, visibility return, and every 2 minutes.
- Global `Update ready` banner when a newer version is deployed.
- `Update safely` button:
  1. Saves the current app state to the normal IndexedDB snapshot.
  2. Creates a pre-update backup snapshot in IndexedDB.
  3. Also stores a localStorage emergency pre-update copy.
  4. Asks the service worker to clear caches / skip waiting.
  5. Reloads the app with a cache-busting update query.
- Tools sheet update card for manual update check.
- Service worker message handler for `OWNER_OP_APPLY_UPDATE`.
- No-cache headers for `/app-version.json` and `/sw.js`.

## Data safety rules

- The app does not auto-refresh while the driver is working.
- The driver must tap `Update safely`.
- Logs are saved before reload.
- Updates keep the same origin/domain so IndexedDB stays intact.
- Pre-update snapshots are kept under:
  - `owner-op-road-ready-pre-update-snapshot-v1` in IndexedDB
  - `owner-op-road-ready-pre-update-snapshot-v1` in localStorage fallback

## Files changed

- `source/src/app/App.jsx`
- `source/src/core/update/appUpdate.js`
- `source/src/modules/update/UpdateBanner.jsx`
- `source/src/shared/ui/ToolsSheet.jsx`
- `lib/local-db/appState.js`
- `public/sw.js`
- `public/app-version.json`
- `next.config.mjs`
- `source/src/styles.css`
- `scripts/verify-safe-update-v9558.mjs`
- `package.json`

## Field behavior

When a new patch is deployed:

1. The app detects the newer version from `/app-version.json`.
2. It shows `Update ready`.
3. Driver taps `Update safely`.
4. App saves logs first.
5. App reloads into the new build.

No DOT/logbook, graph, signing, wallet, or GPS behavior was changed.
