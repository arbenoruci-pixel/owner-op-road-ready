# Road Ready reliability review — 110.4.78

This branch is a test candidate for the existing Road Ready application. The reviewed build is applied after the complete 110.4.77 materialization chain and its existing gates. It includes functional changes to synchronization, HOS, historical edits, source documents, load/week filing and audit preparation. Production publication is pending user review and a verified restore of the complete live data backup.

## Open and inspect the sample version

A Vercel preview opens `/reliability-preview` automatically. This route uses an independent local sample database and does not mount the account login or account-sync gate. The route is disabled in the production environment. It is an inspection workspace using the actual candidate's calculation, editor, document storage, export and audit modules; it does not connect to the driver's live account.

1. In **Documents**, import the two-page sample RateCon, inspect the original and confirm the extracted fields. Try the uncertain-reading example to see fields that need source confirmation.
2. Reopen the stored original and reimport a renamed copy. The content check should reuse its original and filing. Select the next week; the same load remains visible with the same identity.
3. Use **Add POD** on that load. BOL and signed POD retain distinct originals. Optional documents appear as requirements only when applicable, and saved optional receipts remain available at their load.
4. Use **Export & check sample restore**. The ZIP carries one copy of each original, filing metadata, load links, sample logs and audit reviews. A separate temporary database verifies hashes, reopens the restored data and leaves the sample workspace intact.
5. In **Hours & Chicago**, compare the overnight example before and after its sleeper pair completes. Select an event to see the exact historical edit and HOS preview. Canceling changes no stored record; saving requires approval and preserves edit history.
6. Open **Review Chicago time**. The proposal retains `America/Chicago` and the proposed effective boundary. Saving it does not activate a time-zone change or move old events.
7. In **Audit preparation**, confirm synthetic company/jurisdiction scope and review linked evidence. The status distinguishes missing, unconfirmed, applicable, expired and reviewed evidence. In **Sync**, try grouped saves, retry backoff and offline reconnection.

## Implemented changes and verification details

| Area | Implementation and regression notes |
| --- | --- |
| Synchronization | [Queue, transport and conflict review](../reliability-sync/README.md) |
| HOS, editing and Chicago | [Shared calculation, exact previews and time policy](../reliability-hos/README.md) |
| Reader and originals | [Reader import, storage and cloud contracts](../reliability-reader/README.md) |
| Audit preparation | [IFTA, Safety and IRP scope and evidence](../reliability-audit/README.md) |
| Sample workspace | [Preview browser flow](../reliability-preview/README.md) |

The source-before-change bundle was restored independently and its commit verified. The available diagnostic exports were copied and their contents/checksums verified separately. They are not a complete live account backup. Private source documents and diagnostics are not included in this public branch.

The complete live export was prepared in the application, but this session could not retrieve it through the protected browser flow. Its full restore gate therefore remains closed. No production database, historical log, signature, original document, live terminal setting, Motive integration, permission, subscription or permanent-access setting was changed by this work.

## Build and integrity gates

```sh
npm ci --no-audit --no-fund --registry=https://registry.npmjs.org/
node scripts/build-v110.mjs
```

The build uses the real source commit from GitHub/Vercel metadata and publishes nonforced review metadata. The release verifier checks the explicit six-file legacy stable-module revision, all thirty frozen HOS implementation/integration files, retained access and integration contracts, Next client directive ordering, separation of the sample route and the focused reliability regression suites. The local Reader test harness must not be present in an output deployment.

A full clean build must pass before a preview commit is created. Generated runtime files are produced by the existing materializers plus guarded reliability installers; reviewers should edit the installer templates rather than patch a previously generated build in place.

## Results recorded for this candidate

| Gate | Observed result |
| --- | --- |
| Complete clean build | Existing materializers and legacy gates, all reliability installers, final integrity gates and Next production compilation passed. |
| Sync logic and transport | 10 scheduler groups, 6 snapshot/status groups and 19 actual IndexedDB/account-transport scenarios passed. Three actual Gate scenarios also passed in Chromium and WebKit. |
| HOS and historical editor | 29 pure groups and 8 installed-runtime groups passed. Exact edit/approval/history, reopening and pending Chicago/profile flows passed in both engines at phone and tablet widths. |
| Reader core | 54 test files passed. |
| Reader application | Eight actual import/reopen/load/week/POD/export/native-PDF/OCR stages passed in each browser engine. Weak photo readings remain unconfirmed when the source cannot support them. |
| Repeated photo captures | Fifteen capture/transfer contract tests and five additional actual JPG/PNG application stages passed. Each browser retained twenty capture-version records across five intake runs with eight unique physical files, including after reopening and selected packet export. |
| Capture storage and restoration | Ten actual storage groups passed in each engine: concurrent pages, immutable existing versions, real transaction rollback, historical-version selection, scoped transfer/import/reimport, JSON/ZIP restore, account codecs and damaged-content rejection. The fixture retained nine capture records, seven selected versions and three unique byte owners. |
| Original storage and cloud contract | Real IndexedDB/original/ZIP/account-transfer flows passed in both engines. Eleven actual API-handler contract groups and the actual Vault projection/status regression passed with synthetic auth and storage. |
| Audit preparation | 26 core tests, 6 integration tests and actual Chromium/WebKit review/save/reopen/ZIP flows passed. |
| Integrated sample | Seven full checkpoints passed in each engine; no external requests, page errors or real account storage access were observed. |
| Compiled-server preview | Production sample route returned 404. Preview root redirected to the sample. Full compiled Chromium flow and WebKit hydration/import/save/reload/HOS/audit checks passed. |

Browser suites require a separate test environment with Playwright 1.62.1 and its matching Chromium/WebKit browsers. This dependency is not part of the production runtime:

```sh
npm install --no-save --package-lock=false playwright@1.62.1 jszip@3.10.1
PLAYWRIGHT_BROWSERS_PATH=/tmp/road-ready-test-browsers npx playwright install chromium webkit
```

Install the browser libraries required by the host operating system. The isolated Linux verification used local browser libraries; it did not change system packages. See each area's README for its test command and fixture boundaries. The Reader directory includes synthetic fixture setup and a pinned asset URL/checksum manifest; the documented reconstructed photo fixtures are distinct from the original passing-run fixtures. Browser transport responses remain synthetic even where actual application components and IndexedDB execute.

## What remains before production

- Retrieve and verify the complete live backup by restoring into an independent environment, including original files, account records, drivers, signatures and change history.
- Establish the exact historical HOS incident with the adjacent days, preceding cycle, full rest sequence and device chronology. A code-level synthetic reproduction is not proof of that individual incident.
- Confirm the actual carrier HOS profile, duty-period anchor and applicability from records. The candidate retains unsupported/unverified profiles as proposals.
- Review the actual Chicago transition boundary. Historical days keep their original zone; a new wall-clock day can leave a gap or overlap during a zone change. Activation is not implemented as an automatic rewrite of those records.
- Coordinate all writing devices with the new day-evidence fields and capture-reference readers before live synchronization. Older clients do not recognize the added atomic day fields or capture byte references. Capture-bearing selected transfers use version 3 so older readers reject them explicitly; that format check does not upgrade older account/backup clients. Test actual handoff and the actual Road Ready backend without changing access policy.
- Existing byte-owning camera rows remain intact. New captures reuse verified content while preserving every run, page, and variant; any retrospective consolidation of historical duplicates needs its own reviewed migration. No original or historical version is permanently removed by this candidate.
- Review cold offline reopening separately. The existing active-device policy requires an online verification after reopening; this candidate does not bypass it.
- Confirm actual company, fleet, IFTA and IRP base jurisdictions and applicable exemptions. The preparation views do not establish legal compliance or regulatory acceptance.
- Check the preview on physical iPhone and iPad hardware, then obtain the user's approval before production publication. Engine/viewport tests are not physical-device tests.
