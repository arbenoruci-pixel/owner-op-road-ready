# Road Ready 110.1.0 — Logbook isolation

## Release scope

This release hardens the existing modular application without changing stored duty events, migrating database schemas, or replacing device data. It targets the repeated-signature bug, shared-state document/load integrations, and document upload integrity. It is an incremental boundary implementation; the legacy generated App shell and three allowlisted read-only Logbook imports remain.

## Certification contract v1

- A new attestation records that day's canonical events, inspection, mileage, form, route activities, historical profile context and signature image.
- Current truck/trailer, current company/profile and later load lifecycle changes do not invalidate a previously signed day.
- An actual change to certified day content requires recertification. Full canonical payload comparison is authoritative; the short digest is an index.
- Re-signing retains the previous attestation in history. Existing timestamps are never backdated.
- A legacy attestation is upgraded only when it is already Certified and its recorded fingerprint still matches exactly. Mismatches stay available for user review; the release never silently re-signs them.
- Daily form overrides belong to the day. An unchanged form save is a no-op; an intentional change affects the selected log rather than current fleet settings.
- Signature persistence runs after the React commit. Queued snapshots clone their state at invocation to prevent later object mutation from changing the queued write.

## Runtime ownership

`source/src/modules/logbook/public-api.js` defines the protected day buckets and integration operations. Document and load callbacks operate on a private copy, preserve Logbook-owned events, inspections, signatures, day forms, routes, current duty state and fleet context, and return their own document/load output. Document IDs remain the integration references. A proposed duty activity still uses the existing explicit status-confirmation workflow.

Startup normalization cannot replace existing historic or signed-day buckets. Existing incomplete or inconsistent records remain visible for review. No OFF, Driving, inspection or signature records are fabricated to make a test pass.

## Stable-module release guard

`module-locks.v1.json` pins 11 final-materialized runtime files covering certification, daily forms, signing, Logbook display, HOS, timeline, raw-event checks, single-day transfer and the scanner API.

Every production build runs `verify-isolation-locks-v110.mjs`. An intentional change requires a reviewed lock revision and regression tests. New cross-module private Logbook imports fail the build; three existing read-only consumers are explicitly allowlisted. Existing scanner/reader/records-vault architecture checks continue to run.

These are repository/build guards. They do not configure GitHub administrative branch-protection rules, and do not constitute a complete rewrite into independently deployed services.

## Cloud migration transport

Supporting documents use raw binary upload. A successful upload or duplicate response is followed by a download and size/SHA-256 comparison before metadata is committed. Missing bytes and corrupted content remain errors and local originals remain in place. A device may retry the specifically diagnosed older `No content provided` failure once after upgrading. Migration errors block automatic progression into ordinary backup.

The transport tests use synthetic fixtures. Actual migration completion requires the signed-in device to upload its originals and a subsequent server-side count/integrity check. A successful build alone does not establish that all documents have reached cloud storage.

## Verification

- 31 behavioral/source-wiring checks for certification, historical startup, module non-mutation, post-commit persistence and binary readback.
- 6 daily-form/signature-image/client-directive regressions.
- 11 final-runtime file locks and private-import checks.
- Existing architecture tests and four historical signing/location/day-transfer regressions.
- Production-browser workflows in Chromium and WebKit: Sign, persist to IndexedDB, reload, document callback, load callback, reload again, and verify unchanged original events and signature timestamp.
- Browser fixtures intercept external requests and do not use real account credentials or production data.

## Rollout

Build from `scripts/build-v110.mjs`. Version/build identity is `110.1.0` / `v110100-module-isolation`; the release does not force reload. Keep the existing PWA and device backups. Update on the existing origin while parked, then verify one signed historical day and cloud migration status. Physical iPhone suspension/restart, offline transitions and real-document upload remain acceptance checks on the user's device.
