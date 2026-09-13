# Scanner capture and document identity — proposed 110.3.34

Base: merged PR #80, commit `ab75c6e4c2ec68df9ed1a1b0f11dea0edbf33b31`.
Branch: `fix/scanner-capture-reader-v110334`.
Status: proposed in PR #81; not merged or deployed. The PR checks report the current CI result.

## Findings from the recordings

- Owner Op: two distinct pages reach review. The lower crop on the second page includes part of the supporting surface. The reader calls a clearly titled Bill of Lading a Gate Pass / Drop Load.
- TQL: the live camera shows a short confirmation of the processed page, then shrinks it toward the thumbnail and returns to “Ready for next scan.” The reference supports this interaction, not a claim about TQL's internal implementation.
- The Owner Op recording does not establish a direct sheet swap during processing, a long duplicate hold, rotation, reordering, or a saved/reopened final PDF.

## Changes

- A 950 ms processed-page confirmation shrinks toward the camera thumbnail. It does not intercept taps, stop the stream, or add a delay to capture. Reduced motion disables the animation.
- Candidate crop edges are checked against the paper surface inside each edge, reducing selection of furniture/board seams below the sheet. This is a heuristic improvement; difficult real camera scenes still need verification.
- BOL, POD, rate-confirmation and gate-pass identity use headings plus corresponding field groups. Ordinary carrier/trailer words cannot establish a Gate Pass. Unsupported results become “Other” with a request to check the type.
- Conflicting page types or different explicit BOL numbers require review. OCR retries remain alternate readings of one page. Mixed documents lose shipment references and cannot automatically select a load, including after a manual type change.
- The review sheet preserves the reader's uncertain/mixed decision. A manual type choice dismisses the ordinary uncertainty notice; a mixed-document warning remains.

This extends the existing readers; it does not guarantee recognition of every layout, correct damaged OCR, or verify handwriting/signatures.

## Verification

Passed locally against the affected modules:

- New document-identity cases, final-router/UI-qualifier integration, and load-assignment conflict cases.
- Procedural paper detection across mixed/light/dark surfaces, shadows, colored paper, internal rules and no-paper scenes. Six added surface-boundary regressions reduce approximately 30–50 px crop errors in the previous detector to under 7 px at the test image size. No private images are fixtures.
- Existing page-transition/duplicate-prevention tests from 110.3.33.
- Existing Smart Scan routing, document-field semantics and load-assignment contracts.
- Eleven protected runtime file hashes and the Logbook import boundary.
- SWC syntax transformation of the new camera, boundary and identity modules; syntax checks of the browser scripts.

Not completed:

- The complete production build is being checked in CI. After the user authorized project `ghwkcgczuwctzxsxmqzx`, all three live Supabase checks passed locally. Exact materialization reached the new finalizer and exposed two outdated integration anchors; both were corrected, and the finalizer and integration tests passed on that runtime.
- Earlier isolated checks used assembled scanner modules. A subsequent local rebuild stopped in historical `apply-v10959-isolated-document-engines.mjs`, before reaching the new finalizer. These local checks do not establish a complete-release build; the clean GitHub Actions run is the release gate.
- Browser execution: both agent-browser and direct Chromium launch failed; Chromium reports `socket() failed: Operation not permitted` before opening the app. The new browser assertions have been added but not executed here. They extend the existing Chromium/WebKit suites for capture confirmation, a five-second duplicate hold, BOL routing, uncertainty review and mixed PDF pages.
- Installed-iPhone verification. Automated camera/OCR fixtures cannot establish real iPhone camera or OCR performance.

Keep existing CI gates intact. Run the full build and both browser suites in an authorized environment before release.

## Screen-record checklist after an approved build

Record the installed app version/build first. Target: `110.3.34`, `v110334-capture-preview-document-evidence`. Use three clearly distinguishable pages A, B and C from one document; keep unrelated shipments for the separate negative test.

1. Capture A automatically. Move directly to B while A is processing, without showing an empty surface or tapping the shutter. Continue to C. Expect exactly three pages and no camera restart.
2. Keep C visible for five seconds, with a little ordinary hand movement. Expect the count to remain three. Check that each completed capture briefly shows its processed page and updates the thumbnail.
3. Open review using the thumbnail. Verify A/B/C are distinct and complete, especially the lower edges. Return to Camera, then use Done to return to the same pages. During an active capture, Done/thumbnail must not discard the in-flight page.
4. Rotate B through all four orientations. Reorder C before A. Open the enlarged preview, zoom and return. Expect the chosen order and rotation to persist.
5. Read all three pages, go Back, and read again. Confirm the count, order, document type and extracted identifiers against the paper. Save, reopen the PDF and inspect every page. Expect the saved order, rotation and full paper edges to match review.
6. Separately scan a titled BOL, a real Gate Pass, and a page containing only carrier/trailer/arrival details. Expect BOL, Gate Pass and an uncertain type respectively. Confirm manual type selection remains available.
7. Separately scan two BOLs with different BOL numbers together. Expect a mixed-document warning and no automatically chosen load. A manual type change must not remove that warning or create an automatic load assignment.

Record the timestamp and expected/actual page count for any failure. A recording can confirm visible behavior; it cannot by itself prove internal processing or PDF byte preservation.
