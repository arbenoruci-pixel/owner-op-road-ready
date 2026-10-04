# Load library import

A local ZIP import adds historical load folders, preserved originals, DOT cases and read-only driver-day source copies. Documents and Backup both expose the import entry. Smart Scan remains the primary document intake action; direct BOL/POD capture retains its existing load/type context.

The v1 `road-ready-load-library` manifest lives at `RoadReady-Import.json` in a stored ZIP. Every original has a SHA-256 identity, explicit path, byte size, MIME type, filing metadata and provenance. Package IDs bind to the complete manifest. Originals are hashed before preview and on apply; existing originals are hashed to recognize copies across old IDs. Unknown references stay unassigned.

Preview exposes saved/incoming load and document differences. Apply checks the full preview snapshot again. Documents, blobs and source history share one Dexie transaction, with a strict compensated business-store write. Existing payment flags remain unchanged. Repeat imports preserve newer local filing and load values. Original bytes are never rewritten.

Imported closed loads clear matching live-guide pointers and open route state through an idempotent application update. Duty events, daily forms, signatures and driver profiles are untouched. Source date links are explicitly distinguished from exact load references; imported logbook copies never become certified live records.

`core.test.mjs` covers identity, broker conflicts, payment preservation, separate driver links and protected duty data. `browser-import.mjs` checks Chromium and WebKit preview/apply, quota rollback, original deduplication, reload, repeat import, linked source days and narrow layouts. Personal packages and email contents must never enter this public repository.
