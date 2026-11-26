# Phase 1 / Step 2A — development audit

Scope: POD rejection/replacement and settlement display. No API endpoint, Step 2B/C, Phase 2, logbook change, real factoring/payment, or production migration/deployment.

The branch includes the five original already-applied Phase 1 SQL files verbatim (their database migration version/name/MD5 were verified; no real documents, operator identities or credentials were exported). This aligns migration history for isolated testing. It does not rerun them against production. The three separate driver-tools migrations are not part of this regression.

POD rejection is an audited, irreversible decision for a pending original. Old verified bytes, checksum, document identity, and earliest receipt/reference are retained. A rejected candidate is not current for factoring. The old final pointer remains until the carrier approves the replacement, which updates final_pod_id in the same transaction. A different non-rejected final pointer is not displaced by additional-stop approval. For multi-stop loads the eventual owner review UI must explicitly present the intended replacement. Registration/review serialize on load and draft settlement; factoring takes the same load lock. Rejected originals cannot be reactivated, approved, or finalized again. No owner review after issued/paid or factoring claim.

The rollback test uses exact relevant migrations and a disposable PostgreSQL 17 service with minimal Auth/Storage schema and simulated JWT subject claims under the actual authenticated database role. This tests SQL/RLS behavior, not hosted Supabase signed JWT sessions, the phone upload service or real documents. No Supabase branch cost was incurred. Test fixture refuses a DB containing users/loads. CI is limited to this development branch.

settlementDisplay preserves canonical numeric strings (including zero-only fractional scale), rejects malformed/fractional/unsafe amounts, verifies invoice and credit reconciliation, and returns isConfirmed, estimatedNetCents, verifiedNetCents, negativeBalanceCents, and netCents (null until the view confirms payable). Verified net may be a partial subtotal. Confirmed payable does not mean paid. Lumper is part of credits, not added twice.

Local Node v22.16.0 test: 8 passed, 0 failed; committed JS/test blob SHA matched exact tested files. SQL PASS must be supported by actual CI output; never infer from the test source. No deployment/promotion or migration to production is authorized.
