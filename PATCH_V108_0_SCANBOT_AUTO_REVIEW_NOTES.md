# v108.0 Scanbot Auto Review

## Production defect

After accepting a captured page with `Use this one`, Scanbot returned to the camera with a page thumbnail and waited indefinitely. Photos import followed the same blocked capture session. Post-scan export and Road Ready restoration therefore never ran.

## Root cause

The RTU flow combined a single-page limit with an always-visible acknowledgement screen. On iPhone Safari, accepting the acknowledgement added the page to the camera session instead of completing the flow. The previous integration also assumed one exact Scanbot page image API shape during export.

## Fix

- Keep `pagesScanLimit = 1`.
- Set acknowledgement mode to `NONE` so camera and Photos pages move directly to Scanbot Review.
- Keep Review enabled for Crop, Rotate, Retake and Submit.
- Hide Review Add Page because Road Ready handles additional pages after processing.
- Add bounded scanner and image-export timeouts.
- Support the available original/final Scanbot page image API variants.
- Fail clearly on missing or empty page exports.
- Preserve immutable original, restored OCR image and reader safety.

## Expected flow

Camera or Photos -> automatic Scanbot selection/straightening -> Review -> Submit -> Road Ready restoration -> reader.
