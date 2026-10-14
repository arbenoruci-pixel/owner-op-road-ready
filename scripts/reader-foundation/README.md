# Reader evidence foundation

This change does not migrate saved records, rewrite original files, enable automatic filing, change account access, or deploy anything. The load-checklist capture flow remains capture-only.

## Runtime guarantees

- Source-backed fields from supported single-document receipts/invoices use the same projection as shipping documents. Mixed groups retain independent evidence; they are not flattened into a single load.
- `readerAnalysisV1` is a JSON-safe snapshot shared by source preview, explicit save, export and reopened reading. It retains typed candidates, evidence references, groups, page coverage, diagnostics and authoritative type/load choices. Old records remain readable.
- A later source callback uses the current choice handlers. Explicit type and folder choices are not overwritten by delayed reading.
- Rereading replaces only the saved analysis namespace and keeps its previous snapshot. Legacy reread results cannot be hidden by a stale new-format snapshot.
- PDF coverage examines native text quality and raster regions before selecting existing OCR. OCR is bounded to 12 pages, retains native text and sources, and discloses unread/partial/capped/failed pages.
- Classification and extraction diagnostics never imply calibrated accuracy, human verification or permission to file.

## Verification

Synthetic fixtures reproduce damaged BOL headings, independent BOL/load numbers, broker/carrier roles, negative rate-confirmation terms, native/raster PDF combinations, receipt aliases, stale reviews and storage round trips. No private user document is committed or transmitted to a new provider.

Run `READER_OFFLINE_BUILD=1 node scripts/build-v110.mjs` from a fresh checkout. The historic materializers mutate many tracked/generated files and are not safely restartable from an arbitrary intermediate state. Offline mode skips only the legacy live service probe and reports it as not run; static project isolation and all local behavioral checks still execute.

Focused tests:

- `node --test packages/smart-reader-core/test/*.test.mjs`
- `node --test scripts/reader-ai/test-*.mjs`
- `node scripts/test-pdf-coverage-v110363.mjs`
- After materialization: `node scripts/test-pdf-coverage-v110363.mjs --runtime`
- After materialization: `node --test scripts/reader-foundation/runtime.test.mjs`

Always test the clean full build before treating source-only tests as runtime coverage. Do not include the incidental materialized tree in the PR.

## Explicit AI field review

The existing authenticated endpoint supports a separate `extract` operation only after the driver chooses **Read missing fields with AI** for one original page. It shares the existing provider, authentication, request budget and image/text limits with classification. Candidates require the selected page's independent source text and are shown as proposals, not automatically copied into saved fields. A candidate opens the original-page confirmation dialog. Provider timeout, unavailability, page/text limits, rejected quotes and skipped stages remain explicit. Tests use synthetic provider responses; they do not send private documents or verify production provider availability.

## BOL to signed POD

The bounded runtime path is same-original metadata promotion: the user reviews an existing BOL's original as signed delivery proof, keeps its identity/content reference, and retains the prior BOL metadata. It remains visibly BOL until the existing full-account synchronization flow has verified the exact metadata and original bytes. No new automatic full backup is enabled. If that flow is disabled, promotion stays pending rather than claiming cloud verification.

Pairing a newly scanned signed POD with an older unsigned scan remains separate work: different originals must have explicit complete-page lineage and matching associations, never merely a matching BOL/load number. Pure eligibility helpers cover that safety boundary, but this PR does not automatically pair such existing files. It never permanently purges blobs or claims that retained history frees existing cloud storage.
