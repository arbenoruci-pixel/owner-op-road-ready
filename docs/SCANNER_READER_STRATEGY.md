# Scanner and reader: approved implementation

Requested by Arben on November 4, 2026 (America/New_York), after confirming the DOT workflow works and asking to lock it. Arben approved implementation with “bone” after reviewing the plan. Scanner-only changes are implemented in release 110.4.101. The DOT baseline remains locked. Microsoft mailbox activation is blocked by its separate application registration and account consent; see MICROSOFT_DOCUMENT_IMPORT.md.

## Findings verified in the current application

- The production reader configuration reports AI enabled for classification and extraction, using `google/gemini-2.5-flash`. A public configuration response confirms availability of the configured feature; it does not prove a paid inference succeeded on the driver's photo.
- `lib/reader-ai/extraction.js` admits an AI field only when its quote already appears in retained non-AI OCR text. Consequently, a correct visual reading of an OCR-missed field is rejected alongside unsupported model output. Image identity and human confirmation need a separate path for visual proposals.
- `lib/reader-ai/extract.js` requires a separate explicit page action for extraction, a supported/confirmed type, and an existing source observation. Classification and extraction share four page requests per scan. Repeated per-field/per-page prompts add work for the driver.
- `SmartScanSheetV105.jsx` simultaneously renders evidence review, pending readings, the full reader, extracted details, type/load/date controls, optional Logbook linkage, and rate-confirmation risks. Several sections repeat the same uncertainty.
- The active camera is `CameraAdapterV3` through `ScanIntakeV110328`, with boundary detection, stable-frame capture, native photo/burst fallback, perspective correction, and local paper cleanup already implemented. Strengthen this path rather than introduce another scanner.
- Procedural boundary, framed-page and paper-cleanup regressions pass. Twelve AI extraction/failure regressions pass. These cover synthetic documents and mocked provider responses. No current original failed photo or live iPhone camera session was available, so real-device capture quality remains unverified.

## One visible flow

**Capture / Import → Check document → Save**

The main review shows the page preview, document type, destination folder, date, and only the essential references or amount for that document. Clearly name the destination before Save. After saving, show one receipt: “Saved · BOL · Load …” with Open and Scan another.

Show a single focused prompt for an actual unresolved choice, such as two possible load numbers. Keep source text, alternative readings, AI provenance, diagnostics, and optional extra fields behind “Details”. Retain original-page access. Important rate-confirmation charges or requirements remain visible and actionable, grouped without duplicate warnings.

## Implementation order and acceptance checks

1. **Capture and image quality.** Reproduce the driver's failed original photo and resulting scan. Check paper containment, corner stability, small-print focus, glare, and captured resolution. Apply perspective correction and shadow normalization to a derived image; darken existing strokes without joining digit gaps or erasing colored signatures/stamps. Preserve the original bytes. Compare the original, current result, and proposed result at full resolution. Add the specific failure as a regression.
2. **Reader recovery.** A single Read document action runs the local reader and, where needed, bounded visual AI using the existing authenticated provider. Keep page identity, image hash, model and request revision. Visual-only proposals must remain distinguishable from independently OCR-supported fields internally. Show the proposed value beside its actual source image for one final confirmation. Never call a model's quote verified OCR, overwrite a driver's confirmed value, or guess missing digits.
3. **Simple filing review.** Present the concise review above; aggregate repeated warnings; reveal only decisions that affect type, destination, key reference, date, or amount. Keep mixed documents separate and preserve the recovery path when reading fails. Saving must name the actual location and retain the original.
4. **Email import.** Start with the driver's Hotmail account using a dedicated application OAuth connection. Import candidate attachments into the same review flow. Add Gmail separately after its consent/verification requirements are resolved.

For each phase: test real originals when available, cancellation/offline behavior, page order, duplicates, wrong-load prevention, stale AI responses, saved-file reopening, and unchanged originals. Keep every DOT source/runtime hash fixed. Do not advertise a numeric accuracy score from heuristic image quality or a model's self-reported confidence.

## Email feasibility

Microsoft Graph supports reading message attachments from personal Microsoft accounts with delegated `Mail.Read`. Use least-privilege read access and an explicit account connection; server-side token storage and refresh are needed for background import. Do not ask for send/delete permissions to import documents. Existing ChatGPT mailbox access does not automatically authorize the Road Ready application.

Use incremental message tracking, retain source message/attachment identifiers and file hashes, reject duplicates, and fetch PDF/image attachments into an incoming-documents queue. The same reader identifies RateCon, BOL, POD and receipts. Show “New documents” and the proposed destination; uncertain matches receive one decision. Do not follow arbitrary links in messages or execute document instructions.

Gmail offers `gmail.readonly`, classified as restricted. Public server-side use may require OAuth verification and a security assessment, subject to documented exceptions. A practical interim option is importing an attachment through the existing file picker; no mailbox integration is yet configured.

Official references checked during the investigation:

- https://learn.microsoft.com/en-us/graph/api/message-list-attachments?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/message-delta
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification

## Next evidence needed

One original camera photo that scans poorly and its resulting scan will let capture changes be assessed against the driver's actual failure. A screenshot of the preview alone cannot measure the original image's focus or resolution. The new capture and reader paths are covered by synthetic image, mocked-provider, rendered-review and full-build checks. Actual iPhone optics and the driver’s failed original still need a device check.
