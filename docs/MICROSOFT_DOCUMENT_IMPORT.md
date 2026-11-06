# Outlook document import

Release 110.4.107 adds **Smart Scan → Import from email**. The first release is an explicit import: select an Inbox or Sent attachment, review it using the existing reader, then use the existing Save action. No automatic mailbox job is enabled.

## Activation status

Implementation and database setup are complete. Production has its dedicated encryption key. Microsoft account consent and real-mailbox acceptance testing remain blocked by the missing Microsoft application registration credentials. The UI reports setup in progress while configuration is incomplete; it never claims that a mailbox is connected.

A ChatGPT Outlook connection is separate from Road Ready's application grant.

## One-time Microsoft setup

1. Register a **Web** application in Microsoft Entra. Enable personal Microsoft accounts (Hotmail/Outlook); use “Accounts in any organizational directory and personal Microsoft accounts” if business Microsoft accounts are also required.
2. Add this exact **Web** redirect URI:
   `https://owner-op-road-ready.vercel.app/api/email-import/callback`
3. Add delegated Microsoft Graph `Mail.Read` and `User.Read`. The flow also requests `openid`, `profile` through MSAL, and `offline_access`. Do not grant application-wide mailbox permissions. Sending, writing, deleting and marking email as read are outside this feature.
4. Store the application ID as `EMAIL_IMPORT_MICROSOFT_CLIENT_ID` and a server credential as `EMAIL_IMPORT_MICROSOFT_CLIENT_SECRET` in the Road Ready Vercel project's **production** environment. The secret value belongs in the environment manager, never chat, source control or a browser field. Record its expiry for rotation.
5. `EMAIL_IMPORT_ENCRYPTION_KEY` is already configured as a sensitive server variable. Do not replace it during activation: replacing it invalidates existing connection caches and pending import receipts.
6. Redeploy. Sign into Road Ready, open Smart Scan → Import from email → Connect Outlook, select the intended account and approve read access.
7. Before enabling any background processing, complete the acceptance tests below against the connected mailbox. Background processing and historical bulk import require a subsequent implementation.

The optional `EMAIL_IMPORT_ORIGIN` must be an exact HTTPS origin and must match the registration's callback. Production defaults to the canonical app origin. Preview environments stay unconfigured.

## Data flow and boundaries

- MSAL Node 7.2.0 uses authorization code + PKCE, explicit account selection, nonce and a one-use state bound to the authenticated and approved Road Ready owner.
- A ten-minute Secure/HttpOnly/SameSite=Lax cookie carries an encrypted Road Ready session and PKCE verifier for the full-page callback. Microsoft access/refresh tokens remain in a server-encrypted MSAL cache in `road_ready_email_connections`. They are never returned to browser JavaScript or added to document backups.
- AES-256-GCM binds the cache to its owner and connection generation. RLS also limits the tables to their approved owner. No service-role key is used. Refresh writes use compare-and-swap; an in-flight callback or refresh cannot recreate a disconnected grant.
- Disconnect deletes the stored connection and pending sign-in. Already saved originals and deduplication receipts remain. Microsoft consent can separately be removed in the Microsoft account's app permissions; disconnect does not revoke consent at Microsoft.
- Only Graph GETs retrieve metadata and original file attachments. Email bodies and links are not imported. Inline signature images and reference attachments are excluded. The document reader determines the document type from the attachment; a subject containing POD is not proof of delivery.
- Inbox and Sent are paged separately, newest first. Continuation tokens are encrypted, owner/connection/folder bound and expire after 15 minutes. Only permitted Microsoft Graph paths can be fetched.
- Original PDF/image bytes are streamed unchanged (up to 12 MiB), rehashed in the browser and passed into Smart Scan. Existing native PDF reading runs before its normal fallback. No mailbox token reaches the reader or an AI provider.
- The durable `road_ready_email_imports` ledger is acknowledged **after Save**, not after download or reading. Failed acknowledgements are retried from saved document provenance. Identical per-account SHA-256 hashes are skipped, including resends under new message IDs; changed bytes remain separate versions.
- Provenance contains account/message/attachment identifiers, content hash, sender/subject/date and an opaque save receipt. It accompanies the saved document; it cannot grant mailbox access.
- Saved documents follow the existing type/load/date review. No email action accepts bookings, sends replies, follows POD upload links, changes signed logs or independently marks a load completed.

## Verification

- `node --test scripts/email-connect/server.test.mjs scripts/scanner-clear/email.test.mjs`: configuration/auth isolation, cross-origin rejection, PKCE/state/nonce, replay/cancellation, refresh/disconnect races, folder cursors, byte integrity, save acknowledgements, resends and revisions.
- Full materialization/build includes these tests and all protected DOT source/runtime checks.
- `scripts/email-connect/browser.mjs`: phone-sized synthetic Inbox/Sent, setup state, pagination/deduplication, retry after failure, native PDF fields, explicit save, provenance and exact original after reload.
- Database checks: RLS enabled; anonymous access absent; a transactional test saw one own row and zero rows from another identity, then rolled back. Security advisors returned no findings for the new tables.
- Required live acceptance after registration: real consent/cancellation in Safari/PWA; callback session continuity; Inbox/Sent pagination; token refresh; disconnect/reconnect/account switching; interrupted and >4.5 MB streaming downloads; repeated and revised RateCons; signed POD classification and exact load review. No real mailbox connection or import has been claimed before these checks.

References checked:
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- https://learn.microsoft.com/en-us/entra/msal/javascript/node/caching
- https://learn.microsoft.com/en-us/graph/api/user-list-messages
- https://learn.microsoft.com/en-us/graph/api/message-list-attachments
- https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions
