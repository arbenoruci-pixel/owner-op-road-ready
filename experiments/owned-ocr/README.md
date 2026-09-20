# Owned Reader v2 — local experimental pipeline

This is an original implementation of a compact convolutional/BiGRU/CTC line
recognizer trained from random initialization. It downloads no pretrained model
and calls no OCR service. PyTorch provides tensor operations and optimization;
Pillow provides image decoding/rendering. These remain software dependencies.

V2 adds our pixel-component line detector, page-coordinate grouping, native-PDF
ingestion, an offline source viewer, and explicitly confirmed layout memory.
The recognizer masks padded CNN columns and packs the bidirectional GRU so a
short line's prediction does not depend on the other batch items. Training uses
generic generated document text and selects weights by validation character error.

This remains a **local experiment**, separate from the live PWA. No weights or
Python runtime are bundled into the phone application. Phone performance,
handwriting, perspective correction and reliability on arbitrary photographs
have not been established. The existing live phone recognizer is unchanged.

The owned OCR path uses no pretrained OCR model, Tesseract, external OCR service,
commercial OCR SDK, or per-page API. PyTorch, NumPy, Pillow, Node, fonts, and Poppler
are ordinary software dependencies with their own license terms. This is not a
claim that the entire dependency stack has no licenses or infrastructure costs.

## Read a document locally

Install Node 20+ and Poppler (`pdftotext` and `pdftoppm`; on Ubuntu the package is
`poppler-utils`). A native PDF needs Python/Pillow and these tools, but no neural
checkpoint. A scanned page or photo needs our trained checkpoint too.

```bash
python experiments/owned-ocr/document.py \
  --input /private/RateConfirmation.pdf --output /private/native-review
python experiments/owned-ocr/document.py \
  --input /private/photo.jpg --checkpoint /private/model.pt \
  --output /private/photo-review
```

Open the output's `review.html` alongside its `page-*.png` files. Clicking a
candidate highlights its exact source page and line. The output also includes
`input.json`, `result.json`, `metadata.json`, and native word reference boxes.
Raster reviews include detected-region overlays. Source PNGs and checkpoints are
hashed. Native text and inferred OCR have separate provenance. No output writes
to the logbook, approves a value, or files a document.

Native PDF objects are grouped by page geometry; original PDF object order is
not reading order. Wide rows retain label/value context, while separate cells
retain stop and column boundaries. Individual PDF words are evaluation references
only: treating the word DELIVERY inside a paragraph as a heading causes false
document boundaries. The native adapter follows the existing core's `confidence:1`
text-layer convention; this is not measured OCR confidence. Owned raster lines
keep `confidence:null` and all supported raster fields are demoted to review.

The renderer verifies source hashes and all candidate/label/continuation evidence.
Missing units, partial addresses and ambiguous values remain unresolved. Native
text can omit handwriting and embedded images; the original page remains visible.

## Remember a confirmed layout

`format-memory.mjs` learns two to six stable labels plus a relative value region.
The caller must provide both `userConfirmed:true` and `allowLayoutLearning:true`,
the current document ID, exact full-line evidence, a format key, and document kind.
This consent is distinct from model-training consent.

It stores no old field value or customer image. Applying the selected format
requires matching labels, compatible spacing/sizes, and one unambiguous new value.
The proposal always contains the new document's evidence and stays unconfirmed.
Repeated labels, changed layouts, different format/kind, and conflicting readings
produce no suggestion. This conservative first version supports translation of
normalized page coordinates, not general projective alignment.

```bash
node experiments/owned-ocr/format-cli.mjs learn \
  /private/old/input.json /private/confirmation.json /private/layout.json
python experiments/owned-ocr/document.py \
  --input /private/new.pdf --output /private/new-review \
  --format-memory /private/layout.json
```

`test-format-memory.mjs` contains a complete example of the confirmation shape.
Layout learning is exposed as a local API/CLI in this version; the live application's
correction screen does not automatically train or update these records.

## Install and train

Use Python 3.12 in a separate environment:

```bash
python -m venv .venv-owned-ocr
. .venv-owned-ocr/bin/activate
python -m pip install torch==2.14.0 --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r experiments/owned-ocr/requirements.txt
python experiments/owned-ocr/train.py \
  --output /private/owned-latin-v2 --steps 6000 --batch-size 20 --threads 2 \
  --train-font /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf \
  --train-font /usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf \
  --train-font /usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf \
  --validation-font /usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf
```

Use locally available font paths with suitable terms. The run records their
content hashes, seed, alphabet, training steps, loss, validation metrics,
PyTorch version, and checkpoint hash. Outputs are `model.pt` and `report.json`.
Do not commit customer images or training checkpoints to this repository. Keep
expensive checkpoints and private evaluations in durable private storage. The
exact V2 experiment command is `bash experiments/owned-ocr/train-v2.sh OUTPUT`;
the shorter command above is an example, not a reproduction of its font split.

For the numeric baseline use `--digits-only --steps 1000`, the first two training
fonts above, and the same held-out validation font. Synthetic generation is
deterministic for a fixed environment and seed. No automatic model promotion runs.

## Real labeled data

Supply one JSON object per line in a manifest:

```json
{"id":"sample-1","image":"lines/sample-1.png","text":"Invoice No: INV-17","group":"vendor-layout-a","split":"train","provenance":"owner-approved-corrected-document"}
```

Use `train`, `validation`, and `test` splits. All pages/crops from a document, vendor
and layout family should share an appropriate group; each group belongs to only
one split. The loader rejects groups and identical image content crossing splits.
Keep images within the manifest directory. Transcriptions must match the pixels
and the configured alphabet. Images are line crops; arbitrary-photo reliability
requires a separate labeled dataset and evaluation of detector and recognizer.

```bash
python experiments/owned-ocr/train.py --manifest data/labels.jsonl --output /tmp/owned-real-model
python experiments/owned-ocr/evaluate.py --checkpoint /tmp/owned-real-model/model.pt --manifest data/labels.jsonl
python -m unittest discover -s experiments/owned-ocr -p 'test_*.py' -v
```

Training reads the train split and reports validation metrics. The evaluator
uses only the test split. Keep test data frozen and do not select models against
test results. Dataset grouping is meaningful only when labels reflect actual
document families; image hashes cannot detect every near-duplicate crop.

## Image to core JSON

Optionally create `regions.json` with reviewed rectangles on the EXIF-oriented source:

```json
[{"x":20,"y":40,"width":550,"height":45}]
```

```bash
python experiments/owned-ocr/recognize.py \
  --checkpoint /tmp/owned-latin-baseline/model.pt \
  --image source.png --regions regions.json > observations.json
node packages/smart-reader-core/bin/read.mjs observations.json > reading.json
```

The output records source-image and checkpoint hashes and normalized source-line
boxes. Recognition confidence is `null`: softmax scores have not been calibrated
on real documents. Omit `--regions` to run the owned detector. Prefer `document.py`
for review, because it also enforces the uncalibrated-raster review state. The raw
core CLI's `supported` field means rule agreement, not established OCR accuracy.

## Evaluate the complete page

Generate a native review bundle first, then run:

```bash
python experiments/owned-ocr/benchmark.py \
  --checkpoint /private/owned-latin-v2/model.pt \
  --reference-bundle /private/native-review --output /private/raster-review
node --test experiments/owned-ocr/test-*.mjs
python -m unittest discover -s experiments/owned-ocr -p 'test_*.py' -v
```

The frozen model sees pixels only. The report distinguishes native-reference line
crops from automatic full-page segmentation. Missing lines count as deletions;
unmatched predicted text counts as insertions. Word-box coverage is a geometric
measurement and must not be reported as recognition accuracy. Case-sensitive CER
normalizes whitespace; reference cells with at least two characters and an
alphanumeric character are included, including failures. Source/checkpoint hashes
and all individual errors are retained.

The supplied RateCon is a **development document**, not an independent benchmark:
its layout was inspected during implementation. Its text/images are excluded from
neural training, and PDF-native text is an imperfect reference rather than a
separate human transcription. Rasterized PDFs are not phone photographs. Do not
select a new checkpoint against this result and then call it held-out accuracy.

The original V1 and V2 synthetic validation distributions differ; their aggregate
metrics do not constitute a controlled before/after comparison. The baseline
files below are kept unchanged.

## Recorded baseline

See `docs/owned-reader/digits-baseline.json` and `latin-baseline.json` for the first
unmodified results, including wrong predictions. Digit-only line exact match was
70%; full-alphabet line exact match was 35.625%, on 160 validation lines per run.
The alphabet includes English letters and ë/ç; this is not a claim of Albanian
language coverage. Both models remain research-only.

Next quality gates are a frozen real-line dataset, broader print/lighting/layout
coverage, a separately evaluated line detector, field-level false-accept metrics,
and deployment measurements on the intended hardware.
