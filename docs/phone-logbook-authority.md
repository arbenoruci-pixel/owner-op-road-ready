# Phone logbook authority and export follow-up

On 12 November 2026, Arben requested that the saved phone state remain the source of truth and that DOT preparation not mix in another account copy. The three-step DOT wizard and signed inspection snapshot remain unchanged.

The active populated phone now rejects incoming cloud changes to its driver days, book fields, driver identity, home timezone and wallet before the account coordinator commits or installs the merge. It retains both existing copies and reports the mismatch. Explicit device receiving remains a separate authorized path. This is a preservation guard; it does not restore, extend or re-sign historical records.

Date export now makes one raw metadata cursor pass, calculates document relationships once, and fetches selected originals by primary key as the ZIP is built. Binary bodies are excluded from selection metadata. Progress shows table counts; cancellation and a 30-second storage inactivity deadline settle an unresponsive request. Original bytes and supporting HOS history are preserved.

Evidence:
- The previously deployed selector made three full passes (516 page reads) over a read-only account metadata sample.
- A simple 389-file / 407.97 MB synthetic fixture passed the prior release; size alone did not reproduce the reported phone failure.
- New regressions check one scan per table, selected-original reads, exact signatures/endpoints, abort/deadline behavior, and prevention of incoming phone-log changes.
- The browser scale regression uses synthetic rich document metadata, 389 originals / 407.97 MB and 140 log days / 619 events in Chromium and WebKit.
- Physical iPhone results must be confirmed on the device. No actual user log records are changed by these tests.
