# Installed-phone feedback and reader learning plan

## Evidence from the supplied 94-second recording

- About 2–12 seconds: the same physical BOL becomes three stored pages after the phone moves.
- Done is displayed after the first page, but processing disables it while the camera starts another capture.
- About 22–48 seconds: all three duplicate pages are read, including retry passes.
- The final packet becomes Other Document. The preview labels only its first copy as BOL.
- The preview offers a fragment of NOT NEGOTIABLE as a BOL identifier and signature/footer instructions as party names. These are incorrect field candidates.
- The recording shows returning to all three page previews. It does not establish successful final PDF saving.

## Changes in 110.3.36

A phone movement or temporarily missing outline no longer rearms capture. A changed paper descriptor must persist across stable observations. Returning to the captured sheet relocks capture, including during processing. The manual shutter remains available when visually similar documents cannot be distinguished automatically.

Done accepts a finish request while a photo is processing. It stops automatic capture immediately, finishes the current photo, and then closes the camera. The current page is accounted for before navigation.

Identifier matching requires a complete NO/NUMBER/ID label, preventing NOT NEGOTIABLE from supplying a BOL number. Form signature/footer text is rejected as a party name in the core and final phone result, and excluded from preview choices. This does not establish correct extraction of every field in the recorded document.

## Verification and limits

Local replay of document descriptors extracted from the supplied video reproduced the old false rearm. With the fix, the saved sheet remained locked from 2 to 17 seconds. This is a recording replay, not a physical-camera benchmark. Real image bytes and unredacted customer documents are not committed to the public repository.

Regressions cover large motion, temporary disappearance, genuine next-page changes during processing, returning to a captured sheet, Done with a deliberately held worker result, field boilerplate rejection, source correction/export, and PDF/page accounting.

The exact original scan is required to diagnose its remaining OCR/layout errors. A compressed screen recording cannot establish the pixels or text supplied to OCR.

## How the owned reader can learn

1. Start with 20–30 original PDFs/photos spanning successful and failed BOLs, rate confirmations and invoices. This is a diagnostic seed, not sufficient evidence for a universal recognizer. Retain the original photo, corrected page and OCR observations.
2. Annotate document type, exact field values and the actual source regions. For OCR, transcribe the entire cropped text line, including punctuation and ambiguous/illegible markings. A corrected field value alone is not the label for a larger source line.
3. Create image/transcription pairs using the existing `experiments/owned-ocr` manifest contract: id, image, text, group, split and provenance. The current review JSON references images; it does not contain the image pixels and does not train the model automatically.
4. Keep all photos/crops/retries of one document in one split. Reserve unseen issuer/layout groups for validation and final testing. Never treat three photos of one sheet as three independent documents.
5. Train the owned recognizer locally/server-side against the verified labels. Expand fonts, print size, blur, lighting, perspective and actual document coverage based on measured errors. Measure character error, whole-line accuracy, critical-field exact match, false page joins and incorrect accepted fields separately.
6. Test a candidate model on held-out real documents before enabling it on the phone. Keep the previous model available. A single correction becomes training material only after explicit dataset selection and review; it does not silently change production behavior.

The current neural baseline was trained from random weights on synthetic lines. Its full-alphabet result was 35.625% exact lines on a synthetic unseen-font validation set. Real-document accuracy has not been measured. The current PWA still uses its existing OCR, with the owned core as a review preview.

Dataset separation reference: https://developers.google.com/machine-learning/crash-course/overfitting/dividing-datasets
CTC training reference: https://docs.pytorch.org/docs/stable/generated/torch.nn.CTCLoss.html
