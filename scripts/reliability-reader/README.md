# Reader and document reliability candidate

This is a source-controlled finalizer for the existing Road Ready build. It repairs Reader extraction, document filing, original-file storage, and the document upload business contract. It is an isolated review candidate, not evidence of a production migration or deployment.

The original Reader/API changes passed the tests below. A final targeted extension also covers direct JPG/PNG capture bytes, after the earlier PDF tests exposed an untested boundary. Runtime sources are frozen after both engines passed the final capture storage and UI checks. The parent release workflow owns the clean full build, protected-contract comparison, release review, and any publication decision.

## Findings and resulting behavior

### Rate confirmation reading

A supplied four-page diagnostic export contained usable native text, but the previous Reader did not recognize the rate-confirmation heading/table. The shared vocabulary now recognizes the supported heading and explicit labeled/table fields. This particular reported failure was reproducible from the exported Reader input without uploading or altering the user's documents.

The candidate retains source evidence for the broker, carrier, load/PO references, dates, appointment windows, addresses, payment, and supported stops. The operational projection uses the same reviewed fields as the Reader. It no longer replaces a source appointment window with a guessed single time or discards the full reviewed packet during save. A labeled full street address can supply the route display when there is no separate city cell; that fallback keeps its source-field reference and does not invent a city.

Continuation requires sufficient evidence that the pages belong to the same document. A repeated complete rate confirmation is not automatically appended. Uncertain page boundaries, conflicting OCR reads, unproven stop order, and absent fields stay in review. The supplied four-page diagnostic input now yields one recognized rate confirmation and three unresolved page boundaries; all four source pages remain available. The candidate does not pretend that those three pages were safely joined.

Source confidence and evidence are retained through save/reopen. The new rules do not infer a pickup/delivery address from a carrier's billing address or treat an unlabeled number as the load identifier. Multi-stop layouts that do not establish a reliable order still require review.

### Filing, load identity, and Add POD

An Add action freezes its requested type, load, and stop for the life of the open sheet, including asynchronous classification and review callbacks. The requested folder's week/date is context, not evidence of the document's printed date. A classification mismatch is shown for review without silently moving the file to another load or category.

A full-app test found a second duplicate cause: the first RateCon import belonged to the whole load, but reimport after the guide existed could match the delivery stop and create a different filing. RateCon identity now consistently scopes to the whole load. Stop-specific BOL/POD filings remain independent. A synthetic Friday-to-Tuesday load was verified under both weeks with one stable load ID.

Modern Add POD now requires an explicit check of the receiver signature before recording a confirmed signed POD. An uploaded POD starts with signature review pending, and an unentered document date remains blank. The upload timestamp is separate. All captured pages/versions remain available.

### Original storage and durable save

Full-file SHA-256 establishes content identity. Filename, import time, and file size alone do not establish equality. Renaming a file or importing it more than eight hours later therefore does not duplicate the same filing.

`originalStore.js` maintains one byte-owning original row and small references for new independent filings of that content. The same original can have different load/type links. A signed version with changed bytes remains a separate original, even if its name and size match the unsigned file. Existing byte-owning rows are not automatically converted, merged, or deleted.

`documentSave.js` serializes saves of the same original and writes original references plus complete reviewed metadata in one IndexedDB transaction. A quota failure rolls the transaction back. Explicit Reader, attachment, and document filing paths opt out of the previous lossy business-store fallback. When the original has been saved but a later filing step fails, the UI says so and a retry retains the same document identity.

Point reads, original download/preview, backup/restore, packet export, account-file transport, and compact document transfer resolve original references. Transfers preserve each filing while sharing the complete binary payload. Missing or cyclic references fail explicitly; they are not silently treated as successful exports. Recovery can restore a missing canonical original from a reimport without changing existing filing IDs.

### Raw photos and processed capture versions

Normal JPG/PNG intake runs the image processor before saving. The finished image is the main document original, while the original uploaded photograph, corrected page, display image, and OCR versions are separate capture evidence. The earlier PDF tests, including raster-only scan and photo PDFs, did not exercise this branch. Before the extension, a single photo stored the display bytes twice, and importing an unchanged photo created new full byte copies for its capture variants.

`captureOriginals.js` now keeps every run/page/variant record while allowing new captures to reference an immutable byte owner in either existing binary table. A `capture_original_ref_v1` holds the owner's table, identity, full SHA-256, and byte size. No table, index, database version, or account-access change is required. The finished image reuses its already-saved document original; an exact raw photo or processing output can reuse a verified existing capture owner. Different bytes remain separate, including signed versions, crops, and other valid processing outputs. Existing byte-owning rows are kept intact.

Capture saves use an atomic IndexedDB transaction and coordinate by database. A new run adds its own asset identities and variant descriptions, marks its current selection, and retains prior runs. Reopening an old run resolves its original bytes and verifies their hash and size. An explicit missing, cyclic, corrupt, or ambiguous reference throws a visible error; it cannot silently fall back to the finished display image in place of a missing raw source photograph.

The actual storage tests found that restoring a historical run had projected its old `current:false` flag into the selected descriptors. The restore operation now reads, selects, and updates all runs inside one transaction, and the restored descriptors explicitly identify the current selection. A capture created concurrently cannot remain selected alongside the restored run because the selection uses the transaction's current rows.

Selected document/packet exports resolve every saved capture run, including an owner belonging to an unselected document. They carry the selected capture metadata and exact binary dependencies without copying the unrelated owner's filing/load metadata. ZIP content is shared across main originals and capture variants. Load/week transfers containing captures use envelope version 3; versions 1 and 2 remain readable. A version 3 transfer validates every source identity, scope, size, and full checksum before the atomic import. Clients that understand only the older transfer format reject the newer version.

Fresh selected transfer import also drops source-device original-owner IDs and cloud checkpoints before establishing its own verified byte mapping. Retaining the source mapping had prevented a selected filing from importing when its original owner belonged to another, unselected load. Existing destination filings retain their current organization and mapping; importing the same packet again does not replace them.

Full JSON/ZIP archives retain owner references rather than inflating each alias into another Blob. Creation and restore validate the complete reference graph; decoded owner bytes are checked before any live table is cleared. Full account archives validate owner closure before a commit and decoded staged/current bytes before installation. The existing records-first sync phase remains available while its archive is pending. A source record with a duplicate identity, a key/row identity mismatch, or damaged owner bytes is rejected.

### Cloud originals and pending filing details

The existing database requires UUID values for both cloud document IDs and `client_document_id`, and it has a unique `storage_path`. The implementation therefore keeps separate, stable cloud UUID mappings while preserving old local IDs. One canonical cloud documents row owns one original. Other filings reference it through the existing account-record transport and requested link metadata; they do not insert a second documents row for the same storage path.

The whole first-upload operation is serialized per canonical original, using Web Locks when available and an in-process queue otherwise. This includes cloud UUID allocation. Independent interleaving tests reproduced two storage paths/PUTs before the fix and one mapping, one PUT, and one canonical document after it.

A successful PUT is checkpointed before document/link commit. An exact retry after an interrupted commit reuses the uploaded original. The local original is retained throughout. Returned document identity, path, checksum, size, stored metadata, and the requested link are checked before the operation is reported as successful.

An original's availability is distinct from completed filing metadata. An alias returns `original_synced`, and pending account metadata remains visible. The active Vault projection retains original state, metadata state, and sync scope. Its label is **Cloud original saved · filing details pending** when appropriate; an original that is only local is **Available offline**. A generic "Cloud synced" label is not used as evidence that reviewed filing details have reached another device.

## Runtime integration

The repository materializes much of the application through layered legacy scripts. Do not edit generated UI modules as the canonical change. The supported entry point is:

```sh
node scripts/reliability-reader/install.mjs /path/to/isolated-materialized-runtime
```

The parent build runs this finalizer after the legacy Reader, storage, workspace, and delivery overlays. It copies the helpers and patches explicit anchors. Missing/ambiguous anchors throw instead of silently producing a partial candidate. Reapplication is supported. `importOrder.mjs` preserves a leading `use client` directive before imports and repairs the previously observed prepend ordering error.

The finalizer covers the actual SmartScan sheet, original readers, document projection/Vault, Add attachment sheet, owner workspace storage, archive/backup/transfer paths, and the legacy document queue. It does not enable a previously disabled legacy sync mechanism or alter permissions.

`install.mjs` also invokes `install-capture.mjs`. This focused extension installs the two capture helpers and patches the actual capture getter/writer, safety/portable/large/Everything archives, full account archive validation, selected transfer storage/core/panel, evidence packet builder, and Documents + Logbook export. It preserves the separate Audit finalizer's packet anchors. The only cross-module test fixture adjustment is a no-op capture reader in the synthetic audit fixture.

### Only intentional server route change

`app/api/documents/commit-upload/route.js` is the only changed API route. Its existing authentication, driver resolution, bucket, and storage-path ownership checks are retained. No schema, RLS, subscription, or access configuration changes are required.

Its business behavior changes are narrow:

1. A duplicate document lookup is scoped to the authenticated driver's document. The stored original identity and reviewed metadata must match the repeated request. Identity, checksum/path, or reviewed metadata conflicts return a clear 409 without overwriting the stored row.
2. An exact duplicate continues through the link phase. The previous implementation returned immediately after the document uniqueness error and could leave a link permanently missing after an interrupted first commit.
3. Existing links with the exact requested context are reused. New links use a deterministic valid UUID derived from the driver, canonical document, log day, event chain, load, and relation. Concurrent exact retries therefore contend for the same primary key. A uniqueness response is recovered only by reading and verifying that exact context. Existing legacy link IDs are preserved.
4. A requested log day that does not exist returns a clear 409 rather than reporting an uncreated link as successful.

The server's existing type vocabulary maps RateCon to `other`; the canonical request retains the logical rate-confirmation type in its existing intelligence metadata, and the client verifies it. The implementation does not claim that an alias's independently reviewed title, date, type, or Reader packet has been written into the canonical row. Those filing details travel through the existing account-record transport.

## Completed verification

The following commands passed on the candidate. Unit counts are test-file counts where Node's runner reports each imported file as one test. The browser and server rows report assertion groups/stages instead; these are not a single interchangeable test total.

| Command | Result | Material scope |
| --- | --- | --- |
| `node --test packages/smart-reader-core/test/*.test.mjs` | 54 files passed, 0 failed | Complete existing core suite plus the new source-backed RateCon regression file; baseline was 53 files. |
| `node --test scripts/reliability-reader/filingContext.test.mjs scripts/reliability-reader/importOrder.test.mjs` | 2 files passed, 0 failed | Fixed type/load/stop context, source-date separation, directive ordering and repair. |
| `node scripts/reliability-reader/server-contract.test.mjs /tmp/road-ready-review-runtime` | 11 contract groups passed | Actual create-upload, commit-upload, and read-original handlers with a synthetic Supabase transport that enforces existing UUID and unique-path constraints. |
| `node scripts/reliability-reader/document-status.test.mjs /tmp/road-ready-review-runtime` | Passed | Actual Vault projection and active label wiring for primary, alias, offline, and pending metadata cases. |
| `node scripts/reliability-reader/browser-storage.test.mjs chromium` | Passed | Actual Dexie/IndexedDB, original resolver, writer, binary adapter, packet writer, and account encoder/decoder. |
| `node scripts/reliability-reader/browser-storage.test.mjs webkit` | Passed | The same storage flow in WebKit. |
| `node scripts/reliability-reader/browser-app.test.mjs chromium` | 8 stages passed | Actual app Reader, Add POD, Documents/Load folders, original download, PDF/OCR, and packet export at a 430 × 932 viewport. |
| `node scripts/reliability-reader/browser-app.test.mjs webkit` | 8 stages passed | The same actual component flow in WebKit at an 820 × 1180 viewport. |
| `node scripts/reliability-reader/capture-contract.test.mjs` | 15 contract groups passed | Immutable capture references, duplicate identities, claimed/actual bytes, account identity, scoped dependencies, frozen cloud adapter, v3 corruption/budget, and v1/v2 compatibility. Node builtins only. |
| `ROAD_READY_TEST_RUNTIME=/tmp/road-ready-review-runtime node scripts/reliability-reader/browser-capture-storage.test.mjs chromium` | 10 integration groups passed | Actual capture/restore getters, two-page writers without Web Locks, quota rollback, scoped packet/v3 transfer, JSON/ZIP restore, account codecs/install validation, and missing-main export. |
| `ROAD_READY_TEST_RUNTIME=/tmp/road-ready-review-runtime node scripts/reliability-reader/browser-capture-storage.test.mjs webkit` | 10 integration groups passed | The same installed-runtime capture storage flow in WebKit. |
| `node scripts/reliability-reader/browser-capture-app.test.mjs chromium` | 5 stages passed | Actual direct JPG/PNG input, processing/OCR, repeated import, POD review/save, reload, modern Add POD, and complete packet ZIP. |
| `node scripts/reliability-reader/browser-capture-app.test.mjs webkit` | 5 stages passed | The same direct-photo UI flow in WebKit. |

For a materialized checkout used as the current directory, pass `.` instead of the temporary runtime path to the server-contract and document-status commands. Those scripts read the actual handlers/projection from the supplied runtime; the tests do not substitute rewritten copies of the code under test.

### Storage assertions

The storage test imports an original, reimports a renamed copy ten days later, and links the same content under separate document types/loads. It uses different bytes with the same name and length for a signed POD. Four independent filing records have two byte-owning originals. A synthetic IndexedDB quota exception leaves the previously stored complete metadata unchanged.

After the database closes and reopens, all originals retain their expected hashes and source review pages. Packet export contains four records, two originals, and zero missing files. Actual account encoding uploads two binary objects to a mock chunk store; decoding into a second isolated database restores all four filings and their originals. Removing an original only in that synthetic restored database and reimporting a referring filing repairs the same canonical original while retaining all filing IDs.

Compact transfer contains four records and two binary payloads, and expansion reproduces the bytes. A dangling original reference is rejected. An interrupted cloud commit followed by a retry and a second filing performs one PUT for that original.

### Actual capture storage assertions

The capture storage suite serves the installed runtime modules unchanged apart from resolving the bare Dexie import and two environment adapters: an isolated database provider and a local original-reader fallback. No capture validator, writer, getter, packet builder, transfer importer, or archive implementation is mocked. Both engines loaded the same 32-module set; its recorded SHA-256 is `43cc6e40ce395b21179591c26f51ed47dbad95b25296337edbdef02b67048400`.

The ten groups verify:

1. Initial and repeated capture saves reuse document/capture byte owners, including a legacy owner outside the selected filing, while retaining every source page and variant identity.
2. Independent pages writing the same database with Web Locks disabled keep both runs without duplicate physical content.
3. A real IndexedDB quota exception rolls back capture rows and the document's complete capture metadata.
4. Reopen and historical-run restore return exact source/display bytes and a consistent current selection.
5. Actual selected packet and version 3 transfer resolve an owner outside scope while excluding its unrelated filing metadata.
6. Actual version 3 import and repeat import into another database preserve selected versions and one byte owner per content.
7. Full JSON backup and restore preserve rows and exact bytes; a missing reference is rejected before the target database or local storage changes.
8. Large ZIP inspection/restore and Everything ZIP retain shared owners without expanding aliases into new physical copies.
9. Actual account encoding, decoding, and install validation preserve captures after a new database opens; altered transport chunks are rejected before changing the target.
10. Documents + Logbook export includes available capture versions while still reporting a missing main original.

The full archive scenario retains three physical binary contents, including owners and selected aliases. The selected transfer preserves seven version records without exporting the unselected owner's document metadata. The `ROAD_READY_TEST_RUNTIME` variable can be omitted when the repository itself is the fully materialized runtime; a third positional runtime path is also supported. Set `PLAYWRIGHT_BROWSERS_PATH` to the installed test-browser directory when reproducing either engine.

### Actual server-handler assertions

The eleven groups verify authentication boundaries; legacy local-ID preservation with valid cloud UUIDs; interrupted link recovery; canonical-original reuse by a second filing; concurrent exact link commits; unique-path conflict rejection; reviewed metadata/checksum conflicts; an unavailable requested log day; owner-scoped read-original; rejection of changed original bytes; and concurrent first upload before a legacy record has a UUID mapping.

The completed scenario contains two distinct originals, two canonical cloud document rows, two original PUTs, and four requested links. The real route handlers execute in process. Only their Supabase dependency and storage transport are replaced; no live credentials, project, bucket, or session are used.

### Actual full-app browser stages

1. Real intake reads both pages of a native PDF with PDF.js. Review/save preserves broker, carrier, load/PO, payment, document and appointment dates, full addresses, appointment windows, and two supported stops. Downloaded original bytes match the input SHA-256.
2. The actual load folder reopens and downloads the same complete original. A cross-week load appears under both applicable weeks with one ID.
3. Reimport through the actual Reader retains one document and one load.
4. Fixed Add POD context remains POD at the selected load/stop even when the imported document classifies as RateCon. The independent filing references the existing original bytes.
5. The modern Add POD capture saves to its selected context. A blank document date remains blank and the receiver signature remains pending until confirmed.
6. The actual Packets UI exports three filing records and exactly two complete original files, each verified against the input hash.
7. Browser Tesseract reads a clean two-page image-only scan. Supported fields agree with the source and all original pages remain available.
8. Browser Tesseract reads a degraded two-page photo packet. The complete original and supported source observations survive; a conflicting address and uncertain page boundary remain visible for review. The packet is not automatically assigned a guessed load/date and does not create another load.

The degraded-photo result intentionally has unresolved review work. Passing means uncertainty and the complete evidence survived safely, not that every field was recognized.

### Direct JPG/PNG full-app stages

The additional capture UI test uploads `photo-1.jpg` and `scan-1.png` through the real **Choose a file** input. It does not use the harness's original-file bypass. Each file passes actual image preparation and OCR, then fixed Add POD review and save, twice. A fresh page reload verifies the saved source/processed hashes, and the separate modern Add POD flow imports the JPG once more. The actual Packets UI then exports the result.

Both engines preserved two independent document filings, five intake runs, and twenty capture records, backed by eight unique files across `document_blobs` and `capture_asset_blobs`. Repeating either input added no physical byte copies; all earlier asset/run identities remained. Every main/capture ZIP path was read and hashed. The ZIP had eight binary entries and all twenty version links. Both original JPG/PNG input hashes were present, along with every distinct processing output. No browser page errors or unexpected external requests occurred.

## Browser fixture setup and isolation

`ui-test-page.jsx` is a test-only harness that mounts the real components. It is never copied by `install.mjs`. For an isolated runtime, copy it to `app/reader-ui-test/page.jsx` and start that runtime's Next server. **Exclude the entire `app/reader-ui-test` route from any deployment.** The approved review-preview route, if installed by the parent workflow, is separate.

The browser scripts create fresh profiles with no live account, block service workers, return a synthetic offline response for `/api/*`, and abort unknown external requests. Public PDF.js/Tesseract requests are fulfilled from a local cache of the exact assets used by the app. Tests use only synthetic originals and databases.

Completed runs used Playwright 1.62.1, Chromium revision 1234, and WebKit revision 2336. WebKit's Linux libraries were downloaded and extracted into a temporary test directory, not installed as an application or system configuration change. The script's test-only host-package-validation override was used with those extracted libraries; a normal machine with supported system dependencies can use its standard Playwright setup.

The optional browser suites need test-only dependencies. In an isolated dependency/runtime checkout, install `playwright@1.62.1` and `jszip@3.10.1` using `npm install --no-save --package-lock=false playwright@1.62.1 jszip@3.10.1`, and install the corresponding Chromium/WebKit browsers with Playwright's supported host dependencies. Keep this setup separate from the clean production `npm ci`/build. The actual UI scripts resolve `jszip` from `READER_UI_RUNTIME`; it is not a production dependency. Pure core, capture-contract, and server-handler gates do not depend on Playwright or jszip.

Reproducible optional fixtures and asset cache setup are included:

```sh
# Use an isolated Python environment, with Poppler utilities and DejaVu Sans.
python3 -m pip install reportlab==4.4.9 Pillow==12.3.0
python3 scripts/reliability-reader/setup-fixtures.py --output /tmp/road-ready-reader-fixtures
python3 scripts/reliability-reader/setup-assets.py --output /tmp/road-ready-reader-assets
python3 scripts/reliability-reader/setup-assets.py --output /tmp/road-ready-reader-assets --verify-only
```

The fixture output must be a new/empty directory. Set `READER_UI_FIXTURES` and `READER_UI_ASSETS` to those output paths. `browser-assets.json` pins the exact eight public URLs, filenames, and SHA-256 values used by the app. The fixture generator records source text, tool/font versions, and output hashes. Repeated generation produced identical output hashes. The two clean scan PNGs match the original passing test inputs exactly; the reconstructed degraded JPG/photo PDF uses the recorded degradation settings but has different bytes because the first ad hoc image-processing command was not retained. Its manifest explicitly records that provenance and does not claim a fresh OCR pass. The completed test counts above refer to the original local synthetic fixture hashes; rerunning with regenerated photo fixtures is a new run that should retain its own report.

The actual UI test accepts these environment variables:

| Variable | Purpose |
| --- | --- |
| `READER_UI_ORIGIN` | Isolated Next origin; completed run used `http://127.0.0.1:3017`. |
| `READER_UI_RUNTIME` | Materialized runtime from which to resolve the packet ZIP dependency. |
| `ROAD_READY_TEST_RUNTIME` | Materialized runtime used by the actual capture storage suite. Defaults to its repository root. |
| `READER_UI_FIXTURES` | Directory containing the three `synthetic-rate-*.pdf` files and `photo-1.jpg`/`scan-1.png` for direct-photo tests. |
| `READER_UI_ASSETS` | Directory containing the exact PDF.js, Tesseract worker/core, and English OCR assets listed in the test. |
| `READER_UI_OUTPUTS` | Destination for synthetic JSON reports, screenshots, and packet ZIPs. |
| `READER_TEST_BROWSER` | `chromium` or `webkit`; a positional engine argument is also accepted. |
| `PLAYWRIGHT_BROWSERS_PATH` | Browser installation directory. |

The synthetic native fixture has two pages, an explicit repeated document envelope, labeled fictional parties/addresses, and a terms continuation. The clean scan is a raster-only version of both pages. The photo variant applies skew, contrast reduction, resize, JPEG compression, and slight blur before embedding both images in a PDF. The native fixture and expected values are wholly fictional; the browser test lists its assertions. Prepared binary fixtures and downloaded OCR assets are local test inputs rather than production assets or private documents. The setup scripts reproduce that optional environment; core regression fixtures are included directly in the repository.

`READER_UI_SKIP_OCR=1` is a troubleshooting option, but was **not** used for the eight-stage passing runs recorded above. A run using it must not be reported as scan/photo verification.

## Boundaries and remaining gates

- The supplied real inputs were diagnostic JSON containing Reader source observations. The original private PDFs/photos were not available for a fresh binary import. Read-only reanalysis of those observations and actual synthetic PDF/OCR tests are different evidence and should be described separately.
- Chromium and WebKit with phone/tablet viewports exercise real browser engines and IndexedDB. They do not substitute for a physical iPhone/iPad camera, share sheet, storage-pressure, or signed-in two-device handoff check. Those physical/live checks remain review gates.
- This candidate does not modify historical logs, delete originals, clean up preexisting duplicate rows/links, or change Motive, subscriptions, permissions, authentication, RLS, or schemas. No production data mutation, migration, or deployment was performed as part of these tests.
- The parent workflow's full live-data export/isolated-restore gate and clean release build are separate. A passed Reader suite does not open a production data-change gate or authorize publication.
- New document originals and new captures share verified byte owners across the supported intake and export paths. Preexisting physical duplicate rows remain unchanged; new captures can reference an existing verified owner. No automatic cleanup or migration of historical camera assets is included. All run/page/variant records remain available.
- Capture references require the new resolver on any receiving app. Version 3 load/week transfer prevents an older transfer reader from silently dropping versions; full account/device archives retain the existing schema and need resolver-aware clients. No live old-client upgrade or signed-in cross-version handoff was performed in the isolated tests.
- Existing conflicting cloud metadata returns a reviewable 409 and leaves local evidence intact. It is not automatically overwritten. Independent alias and reviewed filing metadata uses the existing account archive, so original upload confirmation alone is not proof of metadata delivery to another device.
- The existing read-original API size cap is unchanged. A locally retained original above that endpoint's supported size can still require a local/export route rather than a successful cloud read through that endpoint.
- Legacy business writes unrelated to the explicit document flow retain their existing quota behavior. The strict `preserveEvidence` path protects the Reader, attachment, and document saves addressed here.
- No legal-compliance conclusion follows from document presence, signature review, extraction confidence, or these tests. Audit readiness and HOS calculations are handled by their separate candidate modules.

Private diagnostic exports, original content, filenames, load identifiers, and derived private validation JSON must remain outside the public repository. This directory and the new core test fixtures contain only code and synthetic test data.
