# Owned OCR research baseline

This is an original implementation of a compact convolutional/BiGRU/CTC line
recognizer trained from random initialization. It downloads no pretrained model
and calls no OCR service. PyTorch provides tensor operations and optimization;
Pillow provides image decoding/rendering. These remain software dependencies.

The first recorded experiments use synthetic printed lines and disjoint font
files for training and validation. They do **not** establish real-document
accuracy, handwriting support, page-layout detection, or readiness for phone use.
Current recognition requires explicit line regions. No weights are bundled with
the PWA and the current phone recognizer has not been replaced.

## Install and train

Use Python 3.12 in a separate environment:

```bash
python -m venv .venv-owned-ocr
. .venv-owned-ocr/bin/activate
python -m pip install torch==2.14.0 --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r experiments/owned-ocr/requirements.txt
python experiments/owned-ocr/train.py \
  --output /tmp/owned-latin-baseline --steps 1800 --batch-size 24 --threads 2 \
  --train-font /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf \
  --train-font /usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf \
  --train-font /usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf \
  --validation-font /usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf
```

Use locally available font paths with suitable terms. The run records their
content hashes, seed, alphabet, training steps, loss, validation metrics,
PyTorch version, and checkpoint hash. Outputs are `model.pt` and `report.json`.
Do not commit customer images or training checkpoints to this repository.

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
and the configured alphabet. Images are line crops; page detection needs a separate
labeled dataset and evaluation before arbitrary photographs can be read directly.

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

Create `regions.json` with measured pixel rectangles on the EXIF-oriented source:

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
on real documents. Original crops remain necessary for human verification.

## Recorded baseline

See `docs/owned-reader/digits-baseline.json` and `latin-baseline.json` for the first
unmodified results, including wrong predictions. Digit-only line exact match was
70%; full-alphabet line exact match was 35.625%, on 160 validation lines per run.
The alphabet includes English letters and ë/ç; this is not a claim of Albanian
language coverage. Both models remain research-only.

Next quality gates are a frozen real-line dataset, broader print/lighting/layout
coverage, a separately evaluated line detector, field-level false-accept metrics,
and deployment measurements on the intended hardware.
