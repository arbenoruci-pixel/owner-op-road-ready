# Smart load folders

A newly recorded load or shipment appears as one folder before it has files.
The main Loads entry opens Active / Completed / All with search across both
active and completed trips. Completion preserves the same folder and originals.

Each folder shows Ratecon, pickup BOL, POD, linked daily logbooks, optional fuel
receipts and other load paperwork. The existing evidence rules continue to flag
missing stops or details. Fuel is attached only by an explicit filing choice;
date proximity never assigns a receipt. Signed logbooks are linked read-only.

Shipment/BOL references remain separate from broker load numbers. A unique,
source-backed alias can display shipment paperwork in a canonical load folder;
ambiguous aliases keep the shipment separate. No records are migrated by this UI.

Adding a POD or fuel receipt from a folder carries that explicit folder into
scanner review. A new rate confirmation keeps its source-backed broker load ID.
Recent undated scans appear before older files and have readable document names.

Opening a file uses local bytes first. Missing local bytes can be read from the
signed-in account workspace and private, hash-verified storage chunks, without
restoring any account data or changing logbooks. The separate legacy upload
session remains a fallback. A metadata-only record reports that its original
has not synced, rather than asking an already signed-in user to log in again.

Validation: folder/read-original unit tests; real React rendered and interaction
tests; Next production compiler; unchanged DOT source and runtime locks. No new
database schema, recurring network work, AI calls or Vercel functions are added.

Two historical build prerequisite repairs preserve the existing tests: the
scanner assignment installer anchors to the stable sync field, and the angled
reader restores the .329 boundary-detector export if a historical materializer
has copied the original gradient detector back over it.

Release validation: clean historical materialization and Next production build pass
locally, with all 48 DOT source and 32 DOT runtime locks unchanged. The scanner
save navigation installer now targets the original button in one operation.
Regression coverage protects filing-aware duplicate display, equivalent Blob and
DataURL originals, form-only log links, and fail-closed account/byte checks.
Shipment documents without evaluated evidence remain marked for review.
Publication still requires passing GitHub checks and browser save/reopen coverage.
