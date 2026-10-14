# BOL to POD: first safe production path

## Enabled path

The existing document-evidence review can reclassify a saved BOL as POD only with a fresh, explicit receiver-signature/received-stamp/received-by acknowledgement against the original. The checkbox is cleared on POD selection and pending-promotion review; inherited extraction/AI `podSigned` does not establish acknowledgement. The save path hashes the original and binds the acknowledgement to that hash and the current review timestamp.

The original document ID and blob remain unchanged. The prior BOL metadata is stored with the candidate. Until verification succeeds, default evidence, folder and recent-file projections continue showing the retained BOL; its pending POD is available in review.

After an already-existing full account archive sync, a bounded verifier:

1. Preserves the existing active-device/owner checks. It does not enable, force or schedule any backup.
2. Reads back the authenticated account workspace at the committed revision.
3. Requires matching candidate metadata and retained BOL history, unambiguous blob identity, complete page coverage and unchanged load/stop associations.
4. Downloads the existing content-addressed cloud file without a local-byte fallback and verifies its whole-file checksum and size.
5. Rechecks the active account and performs an IndexedDB compare-and-swap against the unchanged candidate before storing the primary POD certificate.

A pending, offline, failed, conflicting, records-only or stale checkpoint never hides the BOL. The primary POD exposes “Open previous BOL record.” No file is uploaded, deleted or purged by this feature. Actual originals are not reclaimed.

## Deliberately not enabled

- Automatic matching or replacement by the same load number, BOL number, filename, OCR score or broad same-load similarity.
- Automatic linking of a newly scanned signed POD to a different-byte unsigned BOL. The pure API supports explicit, driver-verified document/page lineage and separately verified persisted originals, with synthetic coverage; a user-facing lineage-selection flow is still required.
- Mixed-document packets, changed load/stop/event associations, partial-page replacements or documents without a verified full page count.
- Signature recognition as a substitute for the driver's explicit source review.
- A new cloud service, schema migration, authentication grant, sync-setting change or active-writer bypass.

## Integration and verification

Run `installPodSupersession.mjs` after the reader foundation installer in the existing materialization chain. Canonical sources are `podSupersession.js`, `podCheckpoint.js` and `podSupersessionRuntime.js`; the installer copies runtime modules and patches the existing review, account sync and presentation entry points.

`node --test scripts/reader-foundation/podSupersession.test.mjs scripts/reader-foundation/pod-runtime.test.mjs` covers 54 synthetic tests, including the materialized save/reopen path and mocked authenticated-cloud finalization. No live Supabase probe was run. Parent build and browser checks remain separately reported.
