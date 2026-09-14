# Reader packet follow-up — 110.3.38

The installed-phone recording from release 110.3.37 captured three distinct
pages and reached reading review. Holding the first sheet in view did not add
duplicates. Reading still lost a company name to table ruling, left a second
shipping form and an unloading receipt unclassified, and exposed the receipt
total as a packet-wide amount. This release addresses those reading failures.

## Changes

- Skip punctuation and thin, low-confidence ruling fragments before a shipping
  block value. Unreadable text and address rows still stop a party proposal.
- Read explicit label/value cells on the same row, keeping both source ranges
  and coordinates. Geometric proposals require confirmation.
- Recognize a BOL without a clean heading only when origin, consigned
  destination, carrier, total weight and BOL terms all occur on the page. Keep
  that classification marked for review and retain its supporting lines.
- Add an unloading-receipt profile with receipt identity, date, carrier,
  location, trailer, PO and separate amount, fee and total fields. Compare
  amount plus fee with total and recalculate after each correction. Do not
  infer a currency from a dollar sign or assume a missing fee is zero.
- Keep mixed packets out of the aggregate filing fields, including after the
  final evidence qualification and manual type selection. Open per-document
  review automatically and retain every original page for the PDF.
- Reject signature-area party fragments and keep ambiguous OCR values, IDs
  and dates unresolved. Never merge receipts just because they reuse an ID.

## Verification

- Thirty owned-reader core tests, including a generic three-document packet,
  exact source resolution, conflicting OCR, ruling/address boundaries and
  receipt correction arithmetic.
- Materialized app tests exercise initial routing, final screen qualification
  and manual type selection. None may restore packet-wide financial fields,
  including same-type BOLs with missing/weak IDs or conflicting parties. A
  supported shared ID with agreeing parties still permits continuation pages.
- Automatic review identified loss of structural classification uncertainty
  and same-type packet isolation. The fallback now carries review status into
  the final decision; isolation follows owned document boundaries as well as
  differing types. Text-only review preserves available OCR confidence.
- Browser coverage sends three images through the phone OCR adapter and UI,
  verifies the three identities, highlights a receipt value on page three,
  introduces and repairs an arithmetic mismatch, exports the corrections and
  returns to all three original pages.
- The private phone OCR export was replayed locally to check the reported
  layout. Committed fixtures use generic names, references and different
  amounts; no customer document content is included.

## Limits

The browser OCR fixture verifies adapter and application behavior; it is not a
recognition-quality benchmark. A new installed-phone run must confirm results
with real camera images. The preceding recording did not demonstrate rotation,
reordering or reopening the saved PDF, so those remain phone acceptance checks.

This is an improvement to the owned interpretation engine, not trained OCR
weights. Phone OCR still uses the existing engine. Preview corrections are
exportable and excluded from training by default. Training requires consented
source images plus checked transcriptions and field labels; an OCR JSON alone
does not supply that dataset. The unloading profile is deliberately bounded,
and unfamiliar layouts remain reviewable instead of receiving invented values.
