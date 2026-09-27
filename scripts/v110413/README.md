# Shared document evidence — 110.4.13

A missing-document checklist now uses one catalog of source types, fields and uses across Documents, IFTA, Tax and Audit. It distinguishes missing, unreviewed, reviewed and future requirements. Expected loads/documents make an absent folder visible. Booked deliveries and TONU follow different rules. Existing registered readers remain the source-reading path; their output is a proposal until reviewed against the original.

Reviewed facts are bound to the source SHA-256 and stored with the original vault identity. A receipt can create one source-linked book entry. Fuel amounts and eligible tax-paid volume are separate; DEF/reefer purchases do not enter reviewed truck fuel. Actual jurisdiction mileage is required independently of ratecon estimates, without assuming a fuel purchase in each state.

The reviewed recovery format embeds an ordinary original-preserving transfer, expected-before corrections, proof hashes/page references and archive aliases. A preview precedes application. Existing changed fields stop the operation; repeat recovery preserves later edits. Corrections, original imports and book mirrors share the existing quota-safe transaction and compensated localStorage write. No logbook/profile mutation, automatic load activation or original replacement occurs. Packages and personal source documents must never be committed to this public repository.

Add source kinds/requirements in `evidenceCore.js`. Storage and UI consume the same definitions. This is extensible record coverage, not a claim that every transaction or legal requirement has been discovered. Completeness still depends on dispatch/financial source reconciliation; disconnected email cannot be checked by the app.

Validation: `node scripts/v110413/test.mjs`; browser suite `scripts/v110413/browser-evidence.mjs` (Chromium and WebKit in CI). Release finalizer runs existing duty continuity and module isolation gates. Browser tests exercise recovery, quota rollback, stale local edits, repeat import, exact original bytes, one-source bookkeeping and mobile layout.
