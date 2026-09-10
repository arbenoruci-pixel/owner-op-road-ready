# Outlook invoice sending

The Billing screen builds a PDF containing the carrier invoice and the selected load's original rate confirmation, BOL/POD, and billing support. It validates a positive rate, a broker, an exact recipient, a confirmed receiver signature/stamp, and the actual attached bytes. When factoring is enabled its saved email is authoritative. Personal logbooks, wallet records and other loads are excluded.

## One-time Microsoft setup

Register an application owned by the operator in Microsoft Entra with support for **accounts in any organizational directory and personal Microsoft accounts**. Add the **Single-page application (SPA)** redirect URI:

`https://owner-op-road-ready.vercel.app/outlook-connect.html`

Use delegated Microsoft Graph permissions `Mail.Send` and `User.Read`. The authorization request includes `offline_access` for session renewal. No application permission, tenant-wide mailbox permission or client secret is needed.

Set the public application ID as `MICROSOFT_OUTLOOK_CLIENT_ID` in the production Vercel environment and redeploy. This ID is public configuration, not a secret. Preview domains need their own registered SPA redirect URI if interactive connection is tested there. The configuration endpoint returns only this ID.

Open Billing, save the carrier/factoring profile, choose **Connect Outlook**, and approve the displayed Microsoft account. Review the From, To, amount and packet; then choose **Send invoice**. Do not reuse the client ID or tokens from ChatGPT, a Microsoft first-party app, or another unrelated registration.

Authorization uses PKCE S256, a random state, an exact same-origin callback and source-window checks. The Microsoft token goes directly between the browser and Microsoft; it is scoped to the authenticated Road Ready user and retained only in that browser tab's session storage, outside Road Ready's backups. Disconnect removes it. A new session or expired Microsoft grant can require reconnecting.

## Delivery and retry behavior

The email includes one PDF attachment and requests a Sent Items copy. Only Microsoft Graph's `202 Accepted` response marks submission accepted; it is not a delivery or funding confirmation. Browser storage records intent before the network call. Repeated clicks, reopening and concurrent tabs with Web Locks reuse the saved outcome. Network errors and server errors retain an uncertain status and require Sent Items review; they are never automatically resent. Explicit 4xx rejections can be retried.

Packets of 3,000,000 bytes or more remain downloadable and cannot be sent through the direct attachment endpoint. Large-upload sessions requiring broader mailbox permissions are outside this change. Existing PDF exports remain available.

Microsoft references: https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0 and https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow

## Verification

`node scripts/test-invoice-send-v110320.mjs` checks factoring/broker routing, exact amount, signed BOL/POD, original document completeness, attachment bytes, retry outcomes and duplicate suppression. The browser suite runs the compiled app in mobile Chromium and WebKit with synthetic records. It checks PKCE connection, the generated four-page attachment, accepted/rejected/uncertain sends, reload behavior, missing original files, and absent configuration. Every Microsoft request is intercepted; regression runs never send real mail.
