# Explicit manual duty override and visible activity chips — 110.2.3

Base: c0a9a690a5058d16bdfd5acec333b101ae41f886 / 110.2.2. Build: v110203-motive-override-chips.

## User-approved change

A manual event's edited interval replaces overlapping manual duty time. Covered rows are removed from the active timeline, partial rows are trimmed, and a middle cut preserves both fragments with deterministic unique IDs. A touching neighbor receives the vacated part of the original interval when a handle shrinks it. Existing gaps and unrelated overlaps remain untouched. Moving into blank time creates no invented OFF coverage. The selected ID and untouched row metadata are preserved.

Open, drag preview and Cancel are read-only. Save uses the identical pure interval command with the selected record and a full raw-day snapshot as conflict preconditions. Metadata-only saves retain exact single-row behavior, including live status and GPS. Live rows reserve the rest of their day and automatic Driving rows are protected against overwrite, boundary changes and status conversion. Blocking errors disable Save; no real-time session is silently ended.

Explicit time/status edits and inserts archive cloned before/after day events in logbookEditHistoryByDay. Signatures and certification history remain intact; genuine content changes require recertification. This new history bucket is owned by Logbook and protected against Documents/Loads/Scanner/Wallet commands. Existing whole-state backups carry it; the locked legacy day-transfer export format is unchanged.

ON DUTY chips are visible immediately below status, with 44px targets, accessible selected state and a three-column phone layout. PTI, Fuel, Pickup, Delivery, Drop Off, Drop & Hook, Waiting and Reposition support combinations and deselection. Stored reason names remain backward-compatible. Exact-coordinate guide lines link the existing large grabbers to the selected range. Full-screen graph, safe areas and current worker behavior remain intact.

## Build and boundary discipline

Production still enters through node scripts/build-v110.mjs. The finalizer copies the reviewed overrideContractV11023.js and wires both generated editors and App after legacy materialization, before all final tests, locks and Next compilation. The finalizer's old-anchor-first replacement fixes a substring guard that had left a dangling details close tag.

Only the public Logbook API lock changes: additional explicit commands and its protected history bucket. The other ten locked files, HOS engine, legacy timeline normalizer, daily form, signatures, scanner and cloud schema remain unchanged. Existing tests expecting the old single-row time-edit behavior now assert the intentionally approved neighbor replacement and before-event archive; the other regression assertions remain enabled.

## Verification gate

52 new pure/final-source tests include 1000 seeded connected timeline edits, the supplied long-OFF/overlapping-ON pattern, edge trimming, splitting, blank gaps, short/midnight intervals, stale neighbor rejection, protected live/automatic time, raw history and module boundaries. Compiled Chromium/WebKit phone scenarios cover real pointer dragging, Cancel, Save/reload, PTI+Delivery, PTI+Fuel, Insert splitting and protected Driving. Previous signature/reload, compact/resize, live/GPS and worker upgrade suites remain mandatory. The main workflow verifies the exact production commit and runs hosted synthetic scenarios with account APIs intercepted.

A written test is not execution evidence. Merge only after the exact build and all browser gates pass and screenshots are reviewed. Physical installed-iPhone keyboard/autofill/update confirmation remains separate.

## Safety

Only Owner Operator resources. No real log edits, database restore, migration-status write, PWA reinstall, IndexedDB deletion or forced Driving refresh. Same production origin and force:false. Keep prior deployment dpl_5CBjW52cWsTwcgUc3e1zDHzEZkLG / 110.2.2 for code rollback without restoring old data over newer real records.
