# Date transfer and Smart Import

Installs at the **end** of `build-v110.mjs`. Legacy source generators run first;
this feature never changes their string anchors. Tests assert the final runtime.

Date ZIPs reuse the chunked, stored ZIP implementation and include exact raw
state (without the old repair normalizer), relevant Dexie rows, original PDFs,
scanner sources and all documents for overlapping loads. The embedded transfer
manifest records counts, calendar dates, terminal timezone and original SHA-256
hashes. Package and per-chunk checksums are also verified before preview.

Smart Import merges complete backups, date ZIPs, legacy week/day/JSON backups
and indexed load-library document ZIPs. Unsupported reading/audit ZIPs are
explained. Matching existing HOS days are indivisible evidence: changed or extra
events, signatures, GPS, inspections and certifications are kept as durable
review conflicts, never silently applied. New driver books retain source IDs.

New files and records commit in one Dexie transaction. A deliberately interrupted
transaction rolls back. Business localStorage projection uses a durable commit
journal; Finish recovery replays it only onto its reviewed baseline. Existing
queues, sessions, localStorage, originals and recovery snapshots are never cleared.
Metadata with a missing binary receives the original without a duplicate row.
File content is hashed incrementally in 1 MB reads, and read back after persistence.

`core.test.mjs` uses synthetic pure data; `storage.test.mjs` uses real Dexie with
fake-indexeddb; `browser.mjs` tests the built app with isolated synthetic cloud
fixtures in Chromium and WebKit at iPhone/iPad widths. No real records or remote
backend are modified. The existing HOS and scanner regressions remain enabled.

The 34h option preserves the existing HOS reset finder. The importable ZIP includes
whole boundary calendar days so original duty-event times remain exact. The older
exact 7x24-hour diagnostic export remains separately available for review.

New devices default to America/Chicago. Previously configured terminal zones and
historical event timestamps remain unchanged; a source-zone difference is recorded
for review rather than shifting history.

Known limits: ZIP32 (under 4 GB / 65,535 entries); stored Road Ready ZIPs only;
legacy JSON has no checksums and reports that explicitly. Missing source originals
are disclosed and retained as metadata, never manufactured. No new paid services,
cloud upload path, database migration or background jobs are introduced.

The future-date coverage notice returns zero assessed minutes instead of reading
a later uninitialized total. This one-line stable-module revision pins both the
reviewed predecessor and result hashes, explicitly revises only its lock, and
retains every historical coverage calculation and rendered Driving regression.

Date packages also retain original supporting HOS history for the preceding
eight calendar days and the last older recorded anchor, without clipping events.
The preview identifies these supporting days separately from the selected dates.
A 70-hour cycle regression compares the source clocks to the packaged history.

Compact `BOL#<reference>` headings now require shipping parties before becoming
BOL evidence. A RateCon mentioning a BOL stays a RateCon. The retained end-to-end
scanner test verifies PO references stay in the existing load folder. Account
browser fixtures use the current Settings status panel and explicitly approve
conflicting logbook versions, asserting neither original is silently replaced.

Document closure follows identity fields only, excluding shared driver/user
attributes. Legacy BOL aliases and typed references still select all originals
for their actual overlapping load. Conflicting originals receive deterministic
separate Needs Review identities and retain source provenance. Reimport reuses
that review copy. An unapplied recovery journal blocks subsequent imports in
preview and within the committing transaction, so a pending projection cannot
be replaced. Regression tests exercise each of these failure cases.
