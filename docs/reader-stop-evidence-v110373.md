# Reader stop evidence — 110.3.73 / engine 0.3.18

## Basis and verified scope
The supplied September 18 Reader diagnostic has clear native-PDF stop cells yet null final address/appointment/date values with layout_needs_review. It also repeats exact year-context evidence, contains an O/0 difference between document references, and includes operational clauses only in raw page text.

This release starts from main 2f96e881 (110.3.72). The earlier document-continuity PR #120 remains separate and unmerged. The original user diagnostic and customer details are used only for local replay; repository regression fixtures are synthetic.

## Implementation
- Require a complete, bounded native-PDF pickup and delivery block before supporting section-derived values: positioned high-confidence role markers, one aligned street/city pair, one same-row right-hand appointment, a consistent optional name/placeholder, no extra/weak/cross-observation cells. Generic STOP is supported only in the single PICK 1 / STOP 1 form. Repeated PDF representations alone confer no support.
- Retain raw text, different values, different observations, original boxes and exact evidence. Label provenance removes exact duplicates only. Date ambiguity, full-year-envelope rules, weight units, unresolved party roles and conflict checks remain in force.
- Present the complete joined address, including the locality, and label its source continuation as an address.
- Show a reviewable O/0 document-reference discrepancy without rewriting either reference or merging pages. Explicit confirmation resolves or acknowledges the difference. Review summaries retain the warning status without source-image payloads.
- Expose optional Unit number, VIN, POD requirement, late-fee clause, detention clause and invoice recipient with source quotes. Hidden when absent. Clauses stay textual: no computed deadline, unit assignment, invoice send or financial action is inferred.

## Local verification
All 250 core tests pass, including 33 new cases/groups. Replay of the supplied diagnostic populates pickup/delivery addresses, both dates, both appointment windows and the consignee; the missing weight unit and unproven broker role remain unresolved. The original input remains unchanged, all evidence resolves to its source, and all three pages retain their identities. The prior 36 repeated labels are deduplicated; additional unique role/block evidence is preserved.

The UI installer was applied successfully to the exact saved 110.3.72 materialized runtime. Full build and mobile browser results must be checked for the final candidate commit. The new browser test uses real synthetic PDF extraction in Chromium and WebKit and checks joined-address focus, the O/0 warning and explicit correction, source clauses and all evidence. Physical iPhone behavior remains unverified until the driver tests the production update.

## Boundaries
No Logbook/Duty/Driving, signature, database-schema, storage-reset or account-authentication changes. No automatic filing or replacement of saved human corrections. New read results require rereading the original. Cloud synchronization of corrections and the remainder of the driver-first roadmap are outside this release. Preserve the 110.3.72 finalizer and both sets of regressions when later integrating PR #120; never downgrade the production release.

## Review and compiled-browser follow-up
The core supports standard detention-label punctuation and compares O/0 reference warnings case-insensitively while preserving source strings. Case-only differences do not produce an O/0 warning. Four added regressions cover these cases and conflicting detention amounts.

The first compiled browser run exposed an existing sparse-page source binding flaw: fallback text evidence was extracted before the retained original was assigned its identity. The installer now registers a verified retained original before extraction for fallback text and unpositioned OCR observations. Existing OCR passes retain their own image identities and coordinates. Sparse native/text-only pages open the exact full page without fabricated highlights. An installed-adapter regression checks page/owner isolation, absent originals, input immutability and OCR-variant geometry. The browser test verifies a real page image before allowing its correction.

The source fallback prefers each photo capture's retained perspective-corrected asset over its OCR derivative; PDF pageFiles remain the fallback when no such asset exists. Source-selection tests cover page isolation, missing assets, invalid indices and untouched processing files. Primary reference uniqueness now folds case while retaining every raw variant and evidence item; actual O/0 conflicts among primary anchors remain unresolved.

Populated photo-OCR observations without their own image dimensions also bind to the retained same-page original before extraction. This is a full-page manual-review source: their source labels and text remain OCR, no boxes are assigned, and observations with an exact OCR-image identity keep it. Original page sources are loaded even when another observation on that page has an image, so mixed available/unpositioned reads remain reviewable without sharing coordinates.
