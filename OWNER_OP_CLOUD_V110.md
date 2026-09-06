# Owner Operator private cloud v110

## Isolation
Uses the existing vnidjrxidvusulinozbn Supabase project. All new data tables live in `owner_op`; objects live in private bucket `owner-op-private`. Existing Tepiha tables, policies, bucket, environment variables, repository and deployments are unchanged. Compute/disk and organization quotas remain shared; schema isolation is not physical resource isolation.

Applied migrations: `owner_op_isolated_cloud_foundation_v1`, `owner_op_scoped_cloud_api_v1`. Function: `owner-op-cloud-v1`. RPCs are SECURITY INVOKER, have fixed empty search paths and bounded statement timeouts. User actions verify Auth JWTs before forwarding them to owner-scoped RLS. The officer endpoint uses a random 256-bit capability whose SHA-256 hash is stored. The inspection manifest RPC is service-role only. No service key is present in the application bundle.

## Persistence and retention
Document bytes and canonical gzip-compressed daily snapshots are stored in private Storage; Postgres stores metadata, current-day indexes, immutable revision indexes and package file references. Documents use content-addressed paths; identical day hashes are idempotent. A per-device journal advances after acknowledgement, and stale revisions cannot silently overwrite another device. Original local records are never deleted or replaced by this feature.

All received file/revision metadata has a minimum six-calendar-month retention boundary and a legal-hold field on files. No deletion job is installed. Older dates use a paginated lightweight catalog; full archives download only on request. Eight days is the roadside display window, not the retention period.

## User flow
Digital Wallet > Private cloud wallet > sign in/create verified account > Back up wallet & all logs. First successful manual backup enables foreground online automatic backup; it can be disabled. Cloud credentials use a distinct local storage key. The legacy public-table sync is not enabled by this feature.

Officer package: select wallet documents explicitly; create current day + previous seven days in the configured home-terminal timezone; review before sending. Link lives in URL fragment, expires after four hours and can be revoked. Each download rechecks the capability. Missing dates and gaps are explicit. This is a manual RODS presentation, not an FMCSA-registered ELD transfer. Print/Save PDF renders the daily logs; wallet originals open separately.

## Verification and boundaries
Run `node scripts/test-owner-op-cloud-v110.mjs`; full production assembly uses `node scripts/build-v110.mjs`. The generated historical mileage renderer is syntax checked so the previous nested-brace materializer failure cannot pass this gate.

SQL isolation tests use synthetic users inside a rolled-back transaction. No actual device data is migrated until the owner signs in and backs up on that device. First login, upload, restore/export and iOS officer rendering must be verified with the real installed phone. This feature does not repair the legacy service worker's cold-offline navigation. Opening the entire app from a closed state without internet remains a separate acceptance test.
