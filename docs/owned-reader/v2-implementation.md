# Owned Reader v2

This change delivers a local, original OCR development pipeline and executable
review workflow. It is separate from the production phone Reader. It has no OCR
service calls, pretrained weights, or commercial OCR SDK dependency.

## Problems addressed

The first owned recognizer needed manually supplied line crops. It could not
read a whole page independently. Its backward GRU also consumed padding from
longer samples in the same batch. Native PDF object order could detach labels
from their values, and feeding individual words into document rules could turn
DELIVERY inside a paragraph into a false stop heading.

V2 adds our pixel-run/connected-component detector, source-coordinate grouping,
padding masks through the CNN, packed GRU sequences, varied synthetic document
text, font-separated validation, and validation-based checkpoint selection.
Native PDF text uses Poppler decoding/rendering with our layout adapter and the
existing owned field/rule engine. Single-word reference boxes stay outside the
document classifier.

The executable `document.py` produces native/photo observations, source hashes,
structured results, detected-region overlays, and an offline HTML evidence viewer.
All source image hashes and candidate/label/continuation quotes are checked before
the viewer is produced. Reusing a nonempty output directory is rejected to prevent
mixing a new source with stale results. No application database writes occur.

## Learning a form

`format-memory.mjs` and `format-cli.mjs` store selected stable label text and relative
geometry after explicit confirmation and layout-learning consent. They store no
previous field value. Applying a selected format reads the new document's line
and produces new source evidence. Two or more labels, consistent geometry, one
candidate and matching format/document scopes are required. Suggestions remain
unconfirmed; layout memory does not retrain the neural model.

## Verification and limits

The focused JavaScript suite and existing core regression suite passed together:
291 tests. The Python suite passed 13 tests, including padding independence,
pixel-identical data leakage through different PNG encodings, blank pages,
two-column/reverse-print detection, a complete independently generated native PDF, source-image
tampering, and evaluation accounting for missing/unmatched text. The HTML's inline
script was syntax-checked. Visual browser verification was blocked by the browser's
local-file URL policy and is not claimed.

The supplied three-page native RateCon produced a two-page primary document and a
linked signature certificate. Its primary document had 15 supported fields,
2 requiring review and 4 missing. Missing optional fields are not an accuracy score.
The unitless weight and incomplete delivery address stay unresolved. The source
document is not committed; aggregate neural and raster results are recorded in
the companion V2 result files, with private detailed evidence retained separately.

The model trains from random weights on synthetic content only. The provided
document was used to develop/debug layout, then evaluated with frozen weights;
it is **not an independent benchmark**. Native PDF text is the development
reference, not a separate manual transcription. Oracle line-crop metrics and
automatic full-page metrics are separate. Missing text counts as deletions and
unmatched predictions count as insertions. Rasterized PDF results do not establish
phone-photo or BOL-photo accuracy. No original BOL photo was available for this run.

The detector currently targets upright printed documents and compact reverse-print
labels. It can omit large inverse panels, large headings, handwriting, logos, and text touching rules; perspective
correction and phone deployment are not implemented here. Model confidence remains
uncalibrated, and raster-supported fields are explicitly review-required. Neither
the native nor raster pipeline can automatically file a document.

PyTorch, NumPy, Pillow, Node, Poppler and fonts retain their own software licenses.
There is no claim of a license-free dependency stack or zero hosting/training cost.
No change replaces the live PWA's existing OCR engine or imports these weights
into a production deployment.

See `experiments/owned-ocr/README.md` for reading, training, evaluation and confirmed
layout-memory commands. `train-v2.sh` records the exact synthetic experiment.

## Measured outcome

The selected 6,000-step model has 271,543 parameters; the checkpoint is 1,094,599
bytes. Synthetic validation CER was 6.05%, with 53.125% exact lines on 160 samples.
This is validation used for model selection, not independent test accuracy.

On the three-page development PDF raster, final full-page CER was **23.23%** and
exact reference-cell match was **51.08%** over 139 cells / 3,693 reference characters.
The automatically detected regions covered 622/624 native word boxes by at least
70% of their area. This 99.68% geometric coverage is not OCR accuracy: lettering,
italics and overprinted signature/footer content still produce substantial errors.
Native-reference crops performed worse (38.21% CER); these PDF-coordinate crops
are not manually perfected crops or an upper bound on recognition quality.

The initial raster pass missed white STOP text in a black cell and classified no
primary form. A targeted reverse-print detector/normalizer fix recovered STOP 1
using the same frozen weights and restored RateCon classification on page 1.
The initial full-page CER was 23.42%. Both evaluations are retained privately.
The final raster result proposes the load number, rate, two short dates and their
appointments; all six require review. It still fails to reconstruct the two-page
RateCon/certificate packet and does not recover the native path's party fields.

This is a concrete prototype and a reproducible failure diagnosis, **not a completed
replacement for production photo OCR**. The next quality work needs appropriately
labeled, consented real-photo data, broader typography and independently separated
document/layout evaluation before phone integration or promotion.
