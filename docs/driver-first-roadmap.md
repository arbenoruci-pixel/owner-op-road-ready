# Driver-first improvements and delivery status

Requested: implement the driver-first Road Ready analysis, with reliable paperwork, a simple Today/load workflow and an eventual path from accepting a load to being paid.
Base: main 1a1613c4436cd1e65281fc09212d5cc285008b0e (110.3.70).

## This change: 110.3.71 document continuity

- Preserve human-confirmed fields across explicit rereading of the same saved original, only when document kind and exact page scope match uniquely.
- Keep new OCR candidates and previous correction provenance separate. Recompute invoice/unloading arithmetic after restoration. Never enable auto-filing or load reassignment.
- Checkpoint compact confirmed review changes in the existing documents_local record. No duplicate original, no OCR transcript stored in localStorage, no new database schema.
- Restore checkpointed confirmations after reopening. Final Save reading atomically keeps previous review history and clears the checkpoint.
- Compare original identity, last committed review and checkpoint revision before writing. Stale tabs, replaced originals and deleted records fail explicitly.
- Keep authenticated cloud originals on the device when the local write succeeds. Verify known byte size and SHA-256. Retain cloud opening if local quota prevents caching, with an explicit message.
- Separate the cloud file's status from the locally stored review's status.
- Keep the fullscreen source controls, exact evidence, pinch/pan and explicit skip semantics.

This change does not implement cloud synchronization of reading corrections. It labels their local scope explicitly. Initial unsaved scan draft recovery, current-page/cursor restoration, and bulk load-level offline pinning are follow-up work.

## Remaining implementation work (not delivered by 110.3.71)

### 1. Durable document and reading synchronization
- A server-acknowledged, versioned reading record linked to an immutable original fingerprint.
- Conflict-safe outbox and separate file/review acknowledgement; retry by mutation ID, never by creating another original.
- Ownership-scoped cross-device restoration and export/restore tests.
- Initial capture/import draft recovery and explicit load-level Keep offline.
- Acceptance: interrupt each save/upload step, restart, recover on another device and verify bytes, confirmed values and audit history; test account changes and rejected access.

### 2. Reader quality and operational instructions
- Rank review items by actual uncertainty and consequence; missing optional fields say Not provided.
- Retain strict evidence thresholds and all existing raw variants, conflict and page-identity checks.
- Versioned revised-document comparison with source-backed change review.
- Source-linked detention, POD deadlines, tracking, reefer and trailer-return requirements; clarify unspecified dates/weekends without inventing terms.
- Accuracy and end-to-end fixtures for Rate Con, BOL, POD, lumper, fuel, invoice, trailer interchange and repairs.

### 3. Today and load workflow
- Keep five navigation positions and optional Logbook behavior; design review before changing existing navigation.
- One context-appropriate action for the active recorded shipment; preserve midnight carryover and deleted-route intent.
- One load dossier with stops, documents, contacts, instructions and relevant costs.
- Separate freight delivery, trailer-return obligation and billing/payment state.
- Per-stop arrival, departure, reference and POD; explicit driver confirmation before any operational mutation.
- Make truck entrance, street address and parking distinct, source-linked data. Map links must describe address opening; truck-safe routing requires a suitable provider integration.

### 4. Billing, money and equipment
- Keep expected, invoiced, accepted, partially paid and actually paid amounts distinct.
- Total-mile estimates include deadhead, declared assumptions, time and costs. Do not infer actual receipts from a sent invoice.
- Factoring fees/reserve reconciliation with explicit evidence and permissions.
- Draft broker communications with recipient/attachments shown before sending; no automatic sends based on OCR.
- Unit-linked maintenance, verified expiry dates and incident evidence.
- Purpose-limited document packages: no private logbook/wallet information in billing packets.

## Boundaries and release gate

Preserve the origin/domain and all stored user data. No storage reset, forced refresh, rewritten duty events, new ELD claims or tax calculations. Keep the protected module hashes and existing graph/signing/GPS/coverage behavior. New external integrations require actual provider configuration and permissions.

Before production: exact build, architecture checks, core tests, mobile Chromium/WebKit regression including skip, reopen recovery and saved-original access. Treat physical-iPhone PWA verification as distinct from automated browser tests. Publish only the capabilities verified for the candidate release; this roadmap is not a completion claim.

## Follow-up review correction in the same PR

Cloud metadata pulls now merge matching document records by client/server identity inside a transaction. Local reading results, checkpoint revisions, classification, and existing original availability remain intact. Cross-owner collisions and conflicting known original fingerprints fail explicitly. Previously duplicated local/server rows keep their separate histories; this change does not delete or combine them. Initial successful pulls enrich missing fingerprints without orphaning valid checkpoints.

Original byte-size or SHA-256 verification failures block opening the unverified cloud bytes. Device quota failures keep the cloud original view available with an explicit local-cache warning.

Focused verification adds 11 pull/autosave/owner/conflict tests to the original 21, for 32 local tests. Full CI uses the real repository dependencies. The mobile regression continues to verify Skip on an unresolved date, then retention once that date is explicitly confirmed.
