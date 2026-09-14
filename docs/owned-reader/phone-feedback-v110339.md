# Angled capture and reader rows — 110.3.39

The phone report showed a correct live paper outline followed by an uncorrected
photo containing carpet and another sheet. The uploaded reader export also
contained company names merged with adjacent form columns and unreadable text
from the uncorrected third image.

## Changes

- Replace independent corner extrema with a cyclic walk of four distinct,
  convex vertices. The old ordering could select the same vertex twice for
  steep pages in portrait photos, then silently substitute a scene-sized crop.
- Preserve a valid corner sequence during perspective processing and page
  review. A manual quarter turn must rotate the corrected page, and reopening
  Adjust must retain that orientation.
- For steep captures, apply the existing text-axis orientation after perspective
  correction and carry the rotation into review state. Avoid a second deskew
  that would trim the already corrected borders. Original photos remain intact.
- End flattened OCR values at explicit neighboring labels, such as Sales Order,
  Delivery, Load Description and Restacks. Preserve exact source ranges.
- Read explicit BOL and date labels at field boundaries in merged rows,
  including the recognized receipt-number/date header. Exclude qualified
  previous-BOL references and revision/expiration dates, as well as instruction
  references, delivery dates and legal party prose. Preserve malformed timestamps,
  weak recognition and conflicting reads for review instead of accepting a guess.

## Verification

- Thirty-six core reader tests cover exact source evidence, separate document
  fields, conflicting observations, malformed timestamps and correction math.
- Nine procedural angled scenes and 216 corner permutations retain all four
  marks, exclude the scene and leave original pixels unchanged.
- Browser coverage exercises live outline plus shutter, saved paper pixels,
  text-axis orientation, Adjust, clockwise Rotate and worker fallback. Existing
  continuous capture, duplicate prevention, pending Done and thumbnail checks
  remain in the same suite. Reader UI coverage includes merged-column fields,
  evidence highlighting, correction/export and retained source pages.
- Private screenshot geometry and OCR rows were replayed locally. Committed
  fixtures use generic document text and procedurally drawn paper; customer
  images and document contents are not included.

## Limits

A new installed-phone run must verify real capture and recognition quality.
The old third-page OCR export contains lost/garbled text; interpretation alone
cannot recover the source document from it. Rescan the same three documents,
including the angled page, and export the new review JSON.

This release strengthens perspective handling and the owned interpretation
engine. It does not train or replace phone OCR weights. The browser OCR fixture
checks application behavior rather than recognition accuracy. Uncertain fields
remain reviewable and no missing unit, identifier or company name is invented.
