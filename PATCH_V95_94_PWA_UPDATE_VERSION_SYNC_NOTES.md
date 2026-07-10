# PATCH V95.94 — PWA update version sync and activation repair

## Root cause found

The deployed v95.93 package advertised `95.93.0` in `package.json` and `public/app-version.json`, while the running client bundle and service worker still identified themselves as `95.91.0`.

That mismatch caused the installed PWA to keep showing `v95.93.0 available` after the update button was used. The service-worker file also stayed byte-identical to v95.91, so iPhone/Safari had no reliable new worker revision to activate.

## Fixed

- Aligned all release markers at `95.94.0`:
  - package.json
  - package-lock.json
  - client runtime version
  - app-version.json
  - service-worker version
- The client runtime version is now injected from package.json during the Next build.
- Added a prebuild version synchronizer so future releases cannot silently ship mismatched PWA version markers.
- Service-worker registration now uses a stable version query and `updateViaCache: 'none'`.
- `Update safely` now:
  1. saves the normal app snapshot,
  2. creates the pre-update backup,
  3. clears stale Cache Storage,
  4. registers/checks the exact new worker revision,
  5. waits for worker activation or controller takeover,
  6. navigates with a cache-busting release URL.
- The worker clears Cache Storage on install and activate, calls `skipWaiting`, and claims open windows.
- The root app document, app-version.json, manifest.webmanifest, and sw.js now receive explicit no-cache headers.
- The root Next.js app document is forced dynamic (`revalidate = 0`) so an installed iPhone PWA cannot reopen an old static HTML shell.

## Data safety

IndexedDB, localStorage log snapshots, duty events, inspections, signatures, routes, miles, documents, and wallet data are preserved. Cache Storage clearing does not erase the driver's log database.

## Preserved

- v95.93 DOT Mode runtime repair
- static DOT document HTML changes
- instant multi-event move controls
- HOS and logbook behavior
