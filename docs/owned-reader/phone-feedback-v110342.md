# Photo-based reader investigation: v110.3.42

Three supplied photos confirmed two shipping forms and an unloading receipt. Private local experiments used the same Tesseract.js 7.0.0 recognizer as the PWA, including original photos, illumination-normalized images and perspective-corrected copies with measured corners. This is a diagnostic sample, not a held-out accuracy benchmark or installed-iPhone acceptance test.

The failures had two causes: full-page OCR skipped shaded receipt bands and mangled small labels; TSV row flattening then mixed shipping columns and unrelated artifacts into fields. A high page confidence could also suppress retries despite missing required fields.

Core 0.3.4 uses word geometry to split widely separated or vertically disjoint row fragments, preserves original lines when word data is incomplete, and retains qualified reference/date contexts. Shipping blocks exclude off-column artifacts while preserving uncertainty in a genuine unreadable first row. Explicit identifier labels accept a semicolon delimiter. Damaged B/L labels can offer source-backed header proposals with `label_needs_review`; they cannot become accepted values.

The image reader retries incomplete field coverage even at high page confidence. The sparse table pass uses adaptive thresholding for shaded fields. A missing BOL reference can trigger one additional small header-region read, with exact image-size checks. Region observations retain their own source image and never replace whole-page text or increase page count. A complete whole-page observation outranks an incomplete one before confidence is considered. OCR parameters reset between reads, threshold variants have separate caches, and parameter failures cannot reuse an unknown worker configuration.

Photo replay recovered the first BOL reference, both shipping parties and PO candidates, plus receipt amount, fee and total. Some dates, label fragments and digits remained imperfect. A region read also produced an incorrect digit sequence; the reader retained the uncertainty. No model was trained or promoted, and no customer images or document text are committed.

Validation includes synthetic geometry/evidence regressions, partial word data, qualified references, damaged-label and numeric conflicts, retry selection, contrast cache isolation, parameter failures, region bounds, whole-page preservation, and browser source inspection/correction/export. Existing CI covers camera controls and module isolation.

The adaptive-threshold experiment follows the supported image-processing options in the [Tesseract quality documentation](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html). Observed improvements above come from local photo tests.
