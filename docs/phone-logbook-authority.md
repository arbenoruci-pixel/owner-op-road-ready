# Phone logbook authority and export follow-up

On 12 November 2026, Arben requested that the saved phone state remain the source of truth and that DOT preparation not mix in another account copy. The three-step DOT wizard and signed inspection snapshot remain unchanged.

The active populated phone now rejects incoming cloud changes to its driver days, book fields, driver identity, home timezone and wallet before the account coordinator commits or installs the merge. It retains both existing copies and reports the mismatch. Explicit device receiving and snapshot-validated manual conflict selections remain separate authorized paths. This is a preservation guard; it does not restore, extend or re-sign historical records.

Date export now makes one raw metadata cursor pass, calculates document relationships once, and fetches selected originals by primary key as the ZIP is built. Binary bodies are excluded from selection metadata. Progress shows table counts; cancellation and a 30-second storage inactivity deadline settle an unresponsive request. Original bytes and supporting HOS history are preserved.

Evidence:
- The previously deployed selector made three full passes (516 page reads) over a read-only account metadata sample.
- A simple 389-file / 407.97 MB synthetic fixture passed the prior release; size alone did not reproduce the reported phone failure.
- New regressions check one scan per table, selected-original reads, exact signatures/endpoints, abort/deadline behavior, and prevention of incoming phone-log changes.
- The browser scale regression uses synthetic rich document metadata, 389 originals / 407.97 MB and 140 log days / 619 events in Chromium and WebKit.
- Physical iPhone results must be confirmed on the device. No actual user log records are changed by these tests.

## PR #281 record-sync regression (13 November 2026)

Run `43261995436` failed in the hidden-tablet save case after the preceding phone handoff/reload. Reproducing the original test on commit `3f7d775c` identified the protected difference as `book / alpha / currentLocation`: the still-mounted tablet retained `lat: null`, `lng: null` and `gpsAccuracy: null`; the reopened phone's existing startup normalization omitted those empty fields and uploaded that version. The three-way merge selected the incoming location, so the phone-authority guard correctly stopped the operation before the unrelated expense could upload.

The business-sync cases now reload the synthetic tablet locally before continuing. They assert that only the three empty GPS fields are normalized and that all other logbook fields, both driver books, duty intervals and signatures are unchanged. The earlier blocked-phone receive assertion now compares the complete logbook. After reload, the expense check waits for the actual received record because the saved logbook can open before background synchronization finishes. A core regression also preserves the exact rejection of the empty-GPS mismatch. No incoming records are injected, no extra handoff permission is granted, and the synchronization guard, production runtime, DOT locks and timeouts remain unchanged.

The browser fixture deliberately permits two synthetic peers for merge-engine coverage. Real active-device takeover and receive authorization remain covered separately by `scripts/v110463/browser-device.mjs` and `scripts/v110455/browser-receive-safety.mjs`.
