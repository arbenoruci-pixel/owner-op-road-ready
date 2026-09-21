# Optional AI classification

The local reader runs first. Uncertain/generic/conflicting page identities and BOL receiver acknowledgement labels can request one visual classification of the retained page. Missing dates or other fields alone do not trigger AI. Clear primary pages are skipped. At most two uncached pages are requested per scan, sequentially. No automatic retries, provider cascade, archive upload, field extraction, or load assignment is added.

AI results are suggestions. The review screen shows their evidence, opens the source page, and requires the driver's existing confirmation action. Blank and pickup signatures cannot pass the POD evidence gate. Fuel needs product, dispensing, and payment evidence. Mixed/uncertain results remain for review. A suggestion never becomes a second OCR vote. The original type, fields, packet guards and manual corrections are preserved. The saved reading and review export retain the AI provenance separately.

## Activation

Disabled unless all three server environment variables are present:

| Variable | Value |
| --- | --- |
| `READER_AI_ENABLED` | `true` |
| `READER_AI_GATEWAY_KEY` | A dedicated Vercel AI Gateway key with an enforced budget |
| `READER_AI_MODEL` | An available `provider/model` supporting image input and JSON schema output |

No key is embedded in the PWA. Ambient Vercel OIDC and other provider keys are deliberately not used. Set the dedicated key's budget **before enabling**; keep auto top-up disabled unless the owner explicitly authorizes it. A key's budget applies across server instances; a Vercel project budget does not cover API-key requests. The in-memory four-requests-per-minute throttle is best effort only, resets on cold starts, and is not a monetary cap. The 10-minute server cache and 40-entry browser memory cache also reset. They are scoped to the account, exact image, OCR context, model and prompt version.

Verify the team's available credits and selected model before activating. Free tier eligibility and model pricing are provider settings, not guaranteed by this feature. The configured model has no automatic substitute. Gateway quota/payment failures stop the batch and return to local review. A configuration change requires deployment of the server. `GET /api/reader/classify` exposes enabled state, prompt version and configured model, never the key.

Authentication validates the existing Owner Operator Supabase JWT, confirmed email and `owner_op_access_v1` approval. No service-role credential or new database table is required. Each POST accepts one resized JPEG/PNG (maximum 2 MB) plus up to 6,000 OCR characters; remote image URLs and client model/prompt overrides are rejected. AI gets the submitted page and OCR context. It receives no other load/account records. Images and raw responses are not logged or persisted by this endpoint; gateway/provider retention is governed by those services' configured policies.

## Verification

`node --test scripts/reader-ai/test-ai-reader.mjs` checks classification gates, approved-session auth, image validation, account cache isolation, failure/limit handling, preserved primary classification, manual choices and cancellation. `node scripts/reader-ai/browser.mjs` exercises the real scanner and source confirmation in Chromium and WebKit using a stubbed AI response and synthetic OCR. These tests verify integration, not model accuracy on real photographs.

Before production activation, run a real image evaluation covering unsigned BOL, pickup-only signature, delivered/signed POD, receipt/DEF, rate confirmation with fuel surcharge, unloading receipt, and unreadable/mixed pages. Record the model, prompt version, expected type, returned evidence and misses. Never describe an uncalibrated model's certainty as measured accuracy.

References: [Gateway image requests](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/images), [structured output](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/structured-outputs), [budgets](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets), [pricing and free tier](https://vercel.com/docs/ai-gateway/pricing).
