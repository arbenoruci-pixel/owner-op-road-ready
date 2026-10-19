# Road Ready isolated reliability review

This route makes the candidate changes reviewable with synthetic records. The preview reuses the app's Reader core, document saving and original storage, HOS engine, historical editor, time-zone proposal, sync scheduler and audit component. It has no account sign-in and uses its own `road-ready-review-sandbox-v1` IndexedDB database. The route installer and production/deployment guards are owned by the parent integration task.

## Try the review

Open `/reliability-preview` on the isolated candidate server or the approved review deployment.

1. **Documents:** Import the two-page sample RateCon, open its original, review the fields and confirm. The source describes a pickup on October 16 and delivery on October 19, 2026. Select either week to see the same load. Reimport a renamed original to check content-based reuse. Add BOL and POD to that load; these have distinct source bytes and remain pending evidence review. Lumper appears as missing only after its applicability box is selected. Saved fuel and other load documents appear as optional cards with their original-opening actions.
2. **Hours & Chicago:** Compare the October 17 pending sleeper pair with the October 18 completed pair. October 15 and 16 contain explicit full OFF days so the synthetic example has a known 34-hour restart. Open a recorded interval, inspect an edit, cancel it or explicitly approve the exact sample change; saving retains history. The Chicago sheet saves a pending proposal and preserves all existing raw event values and the active New York zone.
3. **Audit preparation:** The initial company/applicability profile is unconfirmed. Enter only a synthetic profile for this review, select a week and unit, link source evidence and confirm its actual content and coverage. Weekly evidence remains separate from quarter, license-year and expiration checks. The same byte-bound review survives reopening; a different week or unit does not reuse it. IFTA/IRP bases entered here are review scope, not changes to a registration or log zone.
4. **Sync:** Try 40 quick saves or offline/reconnect. These simulations run the actual scheduler with synthetic responses and make no network sync request. The separate Gate/browser tests cover records-first archive handoff and conflict version changes.
5. **Export:** Export the sample packet after reviewing it. The ZIP contains unique original bytes, all filing references, load links, sample logs, edit history and audit reviews. Export recomputes original hashes. Its restore check opens another randomly named sample database, verifies records and content, closes/reopens it, checks again and disposes only that temporary restore database. It never replaces the working sample or an account database.

## Verification

From the repository root, with the local candidate listening on port 3017:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/road-ready-test-browsers node scripts/reliability-preview/browser.test.mjs --browser=chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/road-ready-test-browsers PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 node scripts/reliability-preview/browser.test.mjs --browser=webkit
```

`ROAD_READY_PREVIEW_URL` may select another **local** candidate. The test rejects non-loopback servers. Both browser runs use fresh mobile contexts, a device timezone different from the log zone, blocked service workers, blocked external requests and instrumentation of storage keys/database access. Screenshots and exported sample files are written outside the repository to `/tmp/road-ready-preview-results`.

Both engines passed the seven integrated flow checkpoints at **390 and 820 pixels**. The final packet has six unique originals and six filings, including the two-page RateCon, separate BOL/POD, a load fuel receipt, a unit 229 receipt and company evidence. Tests verify source hashes, retained PDF pages, one load ID across weeks, exact optional fuel reopening, unit/company source text and metadata, sample edit history, audit persistence and separate restore/reopen. No external requests, page errors, account storage keys or account databases were observed. The only non-preview storage key came from the local Next development debugger. The restored temporary database was removed; the working sample remained unchanged.

The WebKit environment flag skips only package-presence preflight: verified browser libraries were extracted under a temporary path, and the actual engine executed all tests. Browser engines and viewport sizes do not establish operation on a physical iPhone/iPad, its file chooser or actual storage quota.

## Scope of the fixtures

The RateCon demonstration feeds known source-line observations into the actual Reader core and retains a valid, generated two-page PDF with the same text. It is not a measurement of OCR accuracy. The Reader suite separately covers actual PDF extraction, scans and photos. The preview company, loads, signatures and audit confirmations are synthetic. Audit preparation is not a legal compliance guarantee, and no live company jurisdiction has been inferred from this sample.

The preview does not perform live cross-device sync, activate the Chicago time-zone proposal, edit historical account logs, change Motive, change access policy or publish the candidate. Those gates remain with the parent task and the user's review.

## Files

| File | Responsibility |
| --- | --- |
| `fixtures.js` | Synthetic two-page RateCon and explicit duty history |
| `storage.js` | Dedicated sample database, original export and isolated restore verification |
| `ReviewSandbox.jsx` | Actual-module review flow and sample-only adapters |
| `review.css` | Responsive review shell and readable embedded sheets |
| `browser.test.mjs` | Integrated Chromium/WebKit flow, storage isolation and screenshots |
| `install.mjs` | Parent-owned candidate route and deployment integration |
