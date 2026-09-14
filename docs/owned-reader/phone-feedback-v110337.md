# Phone reader feedback — v110.3.37

The supplied September 13 recording and exported reader review were inspected locally. Original customer files and identifiers are excluded from this repository; regressions use generic names and values.

## Observed on the installed phone

- Around 6–10 seconds, Done is available while one capture processes. Around 12 seconds, review contains one page. This sample does not establish long-hold duplicate prevention or consecutive-page performance.
- Reading completes around 24 seconds. The filing screen recognizes a BOL; the experimental source preview incorrectly says Uncategorized document.
- Around 36–38 seconds, flattened OCR columns produce incorrect party names and a street number as a trailer number.
- The recording ends with a reader JSON export. It does not show final PDF saving/reopening, rotation, or reordering.

## Diagnosis and changes

The JSON contains one page with three OCR observations. Two observations contain a non-negotiable Bill of Lading heading which the owned profile rejected. The company name below the centered Ship From label is present, while text sorting interleaves the other column.

- Accept explicit `NOT NEGOTIABLE` heading variants, while retaining shipping signals and anchored heading matching. When source geometry exists, search the top of the page instead of the first twenty fragments.
- Propose the first row below compact left/right shipping labels. Keep exact source offsets, the value's source box, and separate label evidence. These bounded block heuristics always require confirmation; they are not a universal layout model. Missing geometry, a central label, competing first-row values, and obvious address-only rows are left unresolved.
- Retain OCR disagreements and weak recognition. Do not invent a BOL number or repurpose unlabeled/commodity dates. Ignore punctuation-only identifier values.
- Guard the filing form against party/trailer guesses from flattened columns. Only consistent, sufficiently clear, same-line labeled OCR values remain there. Multiline proposals can be checked in Reader preview. Apply the guard to initial reading and manual document-type changes, including associated evidence and equal-valued aliases.
- Version the owned core as 0.2.0. Camera behavior and the OCR recognizer are unchanged.

## Verification

Core regressions cover heading variants, noisy upper-page fragments, separate columns, conflicting company readings, low-confidence labels, source resolution, confirmation, and absent/ambiguous layout. Production-router regressions cover street-as-trailer, stray parties, weak/conflicting inline values, evidence removal, manual type changes, and valid short names.

The browser fixture exercises the actual OCR adapter, source image/highlight, company correction and JSON export using a two-column page. Existing invoice arithmetic and page/PDF/camera tests remain release gates.

Local replay of the supplied export changes the owned classification from unknown to BOL and finds source-backed company candidates. The identifier/date remain unresolved. A new phone scan is still needed to assess real recognition quality after deployment.

## Training boundary

This fixes interpretation of existing OCR evidence. The owned neural OCR remains experimental and is not enabled on the phone. The JSON export contains text/geometry and source image IDs, without image pixels; it is insufficient by itself for image-to-text training. Supervised work requires original page/line images, verified transcriptions, and separate field-role annotations. Keep evaluation documents separate by original document and issuer/template. Preview corrections remain excluded from training unless explicitly opted in.
