# First owned reader implementation

This PR adds a working independent reader core, an experimental source-review UI,
and a from-scratch OCR training and evaluation path. It is a first research and
integration milestone, not a completed universal commercial document reader.

## Delivered

- `packages/smart-reader-core`: standalone importable library and JSON CLI, with
  invoice/BOL profiles, page grouping, exact source ranges, deterministic checks,
  bounded region rereading and explicit versioned corrections.
- `experiments/owned-ocr`: compact line recognizer, synthetic/manifest training,
  frozen-checkpoint evaluation, measured-region inference, and split-leakage guards.
- `scripts/owned-reader`: adapter from existing phone OCR observations and a
  collapsed Reader preview panel. Opening it runs the independent core. A field
  opens its source quote, plus the exact OCR image and line highlight when available.
- Preview corrections can be exported as JSON; they remain separate from the
  filing controls. Closing the preview discards its in-memory corrections unless
  exported. Existing scan/PDF storage is unchanged.
- Proposed app release 110.3.35; engine contract/version 1 / 0.1.0.

The phone adapter explicitly marks its source as `existing-phone-ocr` or
`pdf-text-layer`/`existing-document-text`. It does not present the current OCR as
our trained model. The owned neural model is experimental and is not loaded by
the installed PWA. No OCR SDK/service purchase, new AI provider, customer-data
training, external endpoint, or automatic model promotion is introduced.

## Capture and integration

The camera, capture worker, duplicate detection, crop logic and page review code
are unchanged by this PR. Each OCR observation retains a reference to the image
file it actually read; dimensions are read only when source review is opened.
This avoids drawing coordinates from a processed image over a differently cropped
or rotated original. The original OCR calls and current filing behavior continue.

The new core's classification/extraction is rule-based in this version. Unknown
documents stay included; a later learned classifier can use the same contracts.
Whole-page text detection, arbitrary-layout tables, handwritten text, learned
classification, calibrated automatic acceptance and a hosted commercial API are
future milestones requiring real labeled data and measured performance.

## First OCR measurements

Both runs used random initialization, synthetic lines and an unseen validation
font. These are validation results, not a real-document test or competitor benchmark.

| Experiment | Parameters | Training steps | Validation lines | Character error | Entire line correct |
| --- | ---: | ---: | ---: | ---: | ---: |
| Digits | 261,739 | 1,000 | 160 | 6.308% | 70% |
| Latin alphabet | 271,543 | 1,800 | 160 | 14.502% | 35.625% |

The original reports preserve sample failures and reproducibility metadata.
These measurements demonstrate a functioning training/inference path and expose
the quality gap. Neither model is suitable for automatic document filing.

## Verification

- Core tests exercise source grounding, mixed packets, same-ID different vendors,
  missing pages, retry conflicts, ambiguous values, arithmetic, cancellation,
  immutable corrections and serialized evidence.
- OCR tests exercise CTC repeated characters, actual gradient/weight updates,
  checkpoint loading, crop coordinates and dataset leakage.
- Production integration tests preserve page count, recognizer provenance,
  exact-image geometry and existing app fields.
- Browser regression covers source selection/highlight, correction export,
  unchanged load selection, no additional OCR call, return to selected pages,
  and the existing continuous-capture/PDF workflow in Chromium and WebKit.

## Installed-phone acceptance after deployment

1. Open Smart Scan and capture consecutive pages as before; check duplicate hold,
   Done, thumbnail, rotation and reordering.
2. Read a BOL; open **Reader preview · Check source**.
3. Tap its BOL number; compare the quoted text and highlighted source line.
4. Correct one number and choose **Confirm value in preview**. Check the load
   folder remains your original selection.
5. Export the review and confirm it contains the old quote and your correction.
6. Return to pages; check each page and its order. Save/reopen the final PDF using
   the existing controls.

Physical iPhone testing remains necessary. CI camera/OCR inputs are synthetic.
