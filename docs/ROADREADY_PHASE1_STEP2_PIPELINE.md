# Phase 1 / Step 2 — document pipeline (draft implementation)
    
This is an isolated development branch. Production, logbook, IFTA, analytics, tax center and payment execution are out of scope. No mailbox credentials, real documents, account identifiers or token values belong in this public repository.

## Existing components to reuse

- Operator portal: `app/operator/OperatorPortal.jsx`, `portalData.js`, `PortalSession.jsx`.
- Document reading contracts: `source/src/modules/document-pipeline/`.
- Verified original writer: `scripts/lease-operator/original.mjs`, including SHA-256, original bytes, and existing chunk RPCs.
- Existing private intake review and cursors: `rr_lease_private.intake_review`, `rr_lease_private.mailbox_cursors`.
- Existing `rr_lease_stage_load`, `rr_lease_apply_intake`, `rr_lease_finalize_delivery`, and factoring claim/send lock.
- Phone POD approval/register RPCs and verified ledger already deployed in Phase 1. Reconcile applied migrations with source history before merging a follow-up migration.

## Delivery order (draft)
    
1. Implement proposal-only input contracts and deterministic currency parsing (this commit). Trusted assignments must be independently verified. Shared-card fuel remains in owner review unless the exact transaction is assigned.
2. Add lease-specific original-upload endpoints (`POST /api/operator/pod/create-upload`, `POST /api/operator/pod/commit-upload` proposed). Verify bearer token through Supabase Auth, scope by actual lease operator membership and load, verify private original SHA-256 server-side, call `rr_lease_register_driver_pod` with the driver JWT. The existing logbook upload endpoints are not reused because they have different driver and document identity. No driver can approve their own POD. Keep uploads within endpoint limits or use private signed uploads with validated size/hash; no public buckets or client service-role keys.
3. Owner review endpoint/UI: `GET /api/operator/intake/review`, `POST /api/operator/intake/assign`, and `POST /api/operator/pod/review` (proposed). Use explicit carrier ownership and audited decisions. Owner approval must atomically replace `final_pod_id` with the newly approved final POD while retaining the old original and evidence. Reject or supersede the old candidate without changing a locked or factored settlement; follow-up reconciliation is separate. Add a rollback-only SQL regression test for rejected -> new upload -> approval -> correct final pointer, eligible state, old bytes retained, cross-driver denial, locked week denial, and earliest receipt preserved. No application of a replacement migration until reviewed and tested.
4. Connect existing Gmail/Outlook intake automations to a durable review queue; original source + attachment identifier + checksum; monotonic cursor advances only after all items are filed or held. Never send an invoice or post a charge based solely on AI output. Extract tracking, detention, lumper and POD deadline with source evidence. Unknown/conflicting assignment is owner-only review.
5. FirstLine and Amazon CSV import routes (proposed `POST /api/operator/imports/firstline`, `POST /api/operator/imports/amazon`). Start with real representative redacted CSV headers; preserve private original and raw rows; strict mapping of source transaction/trip identity, amount and status. Reject ambiguous fields, duplicate rows/versions, invalid sums and cross-carrier mappings. FirstLine funding/fees stay carrier-only; Amazon uses official relay export as a separate channel, never scraping. Imported rows are proposals until the verified match or owner approval passes the DB gate.
6. Update Pay using `rr_lease_settlement_totals` / safe driver ledger view. `invoice_gross_cents` includes lumper; `fee_eligible_gross_cents` excludes lumper; `credit_cents` already includes lumper. Show lumper as a breakdown of credits. Render DB net and never recompute it from displayed sums. No duplicate adjustments in UI.
7. Before release, test the real two-driver bearer sessions from separately linked Supabase Auth accounts; no fabricated tokens, no production activation until end-to-end security and finance review.

## First commit scope

`lib/rr-lease/intake-contract.js` and `scripts/lease-operator/intake-contract.test.mjs` are proposal-only, independent of database and UI. No actual imports, endpoint handlers, approval changes, live data, payments or deployment are included in this commit. Later endpoints must enforce all ownership and evidence in a transaction; this client-neutral contract is not an authorization mechanism.
