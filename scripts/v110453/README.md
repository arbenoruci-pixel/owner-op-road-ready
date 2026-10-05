# Driver evidence workspace

Documents now opens a compact Files / Loads / Packets workspace. Existing load folders, direct attachments, billing and reviewed evidence flows remain under Loads. Source documents, current Wallet originals and both drivers' saved log days are searchable together.

## Capture and filing

- Add accepts a photo or PDF and saves original bytes plus a SHA-256 identity and filing details in one IndexedDB transaction. It performs no content reading and does not add or certify a duty event.
- Known document types provide filing suggestions. The user chooses the category and records date, USD amount, vendor, equipment, load and notes. Import time is never treated as receipt date. Undated documents remain findable.
- `documents_local.evidenceFilingV1` stores the current filing; `evidenceFilingHistoryV1` records changes. CAS checks prevent an older open editor overwriting newer filing details.
- Equal source hashes reopen the existing original. No duplicate receipt or financial entry is created. Filing does not post an expense or establish deductibility; bookkeeping workflows remain separate.
- Existing full-device backups and device record indexing already include these local document fields and original blobs. No new database schema or credentials are required.

## Packets

Choose all records, load paperwork, expenses/tax records, maintenance, or inspection/logs, then exact load/unit and date range. Undated records are explicitly selectable. Scope is visible before preparation. A packet includes selected originals, `index.csv`, `Start-here.html`, a JSON manifest with file checksums/filing history and readable saved log copies when selected. Equal file contents are included once and each record retains a manifest entry. Missing originals are listed prominently instead of silently omitted. Packets are review exports, not device-restore backups or assertions of regulatory completeness.

## Validation

`test-core.mjs` covers scope/date/amount behavior, source immutability, both drivers and CSV formula escaping. `browser-workspace.mjs` exercises actual IndexedDB capture, reload, filing history, filtering, exported bytes, duplicate source handling, original load folders, mobile widths and preservation of duty records. External services are mocked with a synthetic account. Existing browser navigation tests explicitly select Loads within the new workspace.

## Next data cleanup

Keep separate from this interface release: verify shortened BOL aliases against originals, repair duplicated internal load IDs with all references in one transaction, reconcile old route/event links, and review existing imported evidence. Do not mark those historical records verified solely because they now appear in this workspace.
