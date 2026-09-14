# Noisy page evidence — 110.3.40

The installed-phone report confirms that angled capture now straightens the
paper. All three reader cards still appeared uncategorized. Replaying the new
export isolated three interpretation failures: a small OCR fragment before a
BOL heading, punctuation before a receipt's load-details heading, and shipping
structure split across complementary OCR observations of one page.

Classification now uses a punctuation-tolerant matching view while preserving
original text. A tiny low-confidence fragment beside a large BOL header can
produce a review-only suggestion; grammatical and negative prefixes remain
meaningful. All existing required supporting signals still apply. Complementary
observations may establish a type on their own page, with each supporting line
linked to its original observation. Repeated clues cannot replace a missing
signal and separate pages cannot lend one another evidence. Conflicting types
remain unresolved. The receipt fallback preserves classification uncertainty.

The private export now yields BOL, unloading receipt, BOL. Numerical OCR errors
remain visible: different readings of an amount or a date are not silently
corrected. This release changes interpretation, not phone OCR weights or camera
processing. Source scan images/PDF are needed to investigate recognition quality;
the JSON alone contains only the recognized text and coordinates.

Verification includes 40 core tests, materialized adapter/routing coverage and
browser coverage of noisy three-page review with different retry observations,
source highlighting, corrections, export and retained originals. Fixtures use
generic text; customer documents are excluded from the repository. Real phone
acceptance remains necessary after publication.
