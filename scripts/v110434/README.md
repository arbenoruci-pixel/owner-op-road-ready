# Load library import

A local ZIP import adds historical load folders, preserved originals, DOT cases and read-only driver-day source copies. Documents and Backup both expose the import entry. Smart Scan remains the primary document intake action; direct BOL/POD capture retains its existing load/type context.

The v1 `road-ready-load-library` manifest lives at `RoadReady-Import.json` in a stored ZIP. Every original has a SHA-256 identity, explicit path, byte size, MIME type, filing metadata and provenance. Package IDs bind to the complete manifest. Originals are hashed before preview and on apply; existing originals are hashed to recognize copies across old IDs. Unknown references stay unassigned.

Preview exposes saved/incoming load and document differences. Apply checks the full preview snapshot again. Documents, blobs and source history share one Dexie transaction, with a strict compensated business-store write. Existing payment flags remain unchanged. Repeat imports preserve newer local filing and load values. Original bytes are never rewritten.

Imported closed loads clear matching live-guide pointers and open route state through an idempotent application update. Duty events, daily forms, signatures and driver profiles are untouched. Source date links are explicitly distinguished from exact load references; imported logbook copies never become certified live records.

`core.test.mjs` covers identity, broker conflicts, payment preservation, separate driver links and protected duty data. `browser-import.mjs` checks Chromium and WebKit preview/apply, quota rollback, original deduplication, reload, repeat import, linked source days and narrow layouts. Personal packages and email contents must never enter this public repository.

Documents + Logbook exports include Imported-Logbooks with readable source copies, source metadata, load links and DOT cases. Source copies remain distinct from current signed logs. Internal audit snapshots and sync queues are excluded from this shareable collection. Export Everything still carries the complete database.

Smart Scan includes imported closed folders in its own candidate list, without exposing them as active dispatch work. Exact printed load/BOL/PO references may select a folder; broker conflicts or repeated references retain the existing confirmation guard. Short secondary aliases cannot establish an automatic match.

Broker mismatches open a saved/incoming comparison during preview. Each mismatched load needs its own explicit same-job confirmation in addition to accepting changed details. Apply rechecks the current snapshot and the confirmation list before any write, then saves the old load and broker decision in the audit. Re-import preserves newer local details without requesting an obsolete broker correction.

The localStorage document index excludes duplicate image data and raw OCR payloads. Full document rows and provenance remain in documents_local; pre-import business-only metadata is retained beside the row and in the import audit. This only compacts matched/imported document mirrors. Unrelated documents, load records, payment fields and live logs are untouched. A real near-full localStorage regression verifies successful import and reload while retaining full OCR and legacy fields in IndexedDB. Index-write failure and database quota failure still abort the transaction and restore the prior business store.

When a compact index still reaches the localStorage quota, the failed import rolls back first. Exact copies of three historical app recovery keys are committed to IndexedDB and read back before their unchanged localStorage copies are removed. Existing restore snapshots are retained; distinct versions are included in Export Everything through sync_meta. The import retries once and rechecks the preview. Unknown keys, active settings and live state are never removed. LIBRARY_STORAGE_PRESSURE=recovery runs the real full-storage regression with small existing document metadata, including archive-write failure, index failure, successful retry and reload.

Recovery cleanup and all app writers (pre-cloud snapshot, pre-update snapshot, emergency copy and complete restore) share an origin-wide Web Lock. Cleanup keeps the fallback copies on browsers without Web Locks. The recovery browser test holds this lock in a second tab and verifies that cleanup waits without removing the backup.
