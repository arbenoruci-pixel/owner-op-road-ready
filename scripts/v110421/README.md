# GPS, DOT Inspection and signing (110.4.21)

## Reproduced defects

- Production `/api/location/reverse?lat=39.661&lng=-75.738` returned an empty city with state `DE` and subdivision `Newark`. The stop is outside the incorporated-place match. The small client city list had no useful nearby fallback.
- The actual `signLogDays` handler, given a previously signed day with `needsRecertification:true`, returned `Needs Recertification` immediately after signing. It spread the old record before spreading the new record, bringing back fields that `createCertificationRecord` intentionally omits. Single-day signing already removed those flags.

## Changes

- A pinned nationwide Census Gazetteer supplies bounded nearby-place fallback on the server and on the device. Census municipality matches stay authoritative. A state-only match restricts the nearby search to that state; administrative subdivisions are never silently called cities. Nearby results carry their distance and a visible confirmation label. Coordinates and accuracy remain from the GPS fix. A remote location beyond 15 miles from a listed place still requires manual entry.
- The server requests only the three needed Census geography layers and uses a four-second upstream budget, within the existing eight-second client budget. Failed lookups record a reason without logging coordinates. Permission, cancellation, historical-location prompts and manual-input protection remain intact.
- `DOT Inspection` joins the shared On Duty activity list for status changes and recorded-event editing. It does not complete the separate pre-trip checklist.
- The shared pre-trip matcher excludes explicit DOT/roadside inspections across save, signing, compliance checks and timeline handling. Adjacent DOT and pre-trip events remain distinct. The finalizer verifies affected locked modules against their prior checksums before recording the reviewed changes.
- Batch signing uses the new attestation directly. Old signed records remain in certification history. Real edits to recorded facts continue to require recertification; nothing automatically signs an old log.

## Data provenance

U.S. Census Bureau, [2025 National Places Gazetteer](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html), public-domain federal data. The checked-in lookup contains 32,350 named places and representative points. Representative points are not city boundaries. The generator records the downloaded ZIP checksum in `censusPlaces.js`; builds require no Census download. Regenerate with `python scripts/v110421/generate-places.py <national-place-zip>`.

## Verification

`node scripts/build-v110.mjs` runs the existing release chain, new focused regressions and module locks. `node scripts/v110421/browser-gps-sign.mjs` exercises single/bulk recertification, durable reload, state-only GPS, DOT activity save and retained coordinates in isolated Chromium and WebKit phone contexts. `scripts/v110409/browser-edit-gps.mjs` retains permission, timeout, coarse-fix, retry, cancel and late/manual-input regression coverage.

Browser fixtures use synthetic accounts and records and intercept account writes. Physical iPhone radio accuracy, the user's actual local IndexedDB, and installed-PWA update behavior require a device check.

Local verification on 2026-09-29 passed: production Next build; all nine focused regressions; pre-trip-after-reset regression; eleven duty-graph groups; eleven module locks; both new flows and all four existing edit/GPS scenarios in Chromium and WebKit. WebKit used workspace-extracted system libraries because this execution host does not install system packages. No production account records were changed.
