# Microsoft document import: prepared, activation blocked

The scanner implementation includes a tested, read-only Microsoft Graph adapter
at `lib/email-import/microsoft.js`. It accepts an account-scoped token supplied by
the host, lists PDF/image attachments, downloads originals unchanged and detects
duplicate bytes using SHA-256. It excludes inline signatures and link attachments,
bounds requests/file size, rejects cross-origin continuation URLs, and performs
only GET requests. It does not connect an account or run in production yet.

Production environment metadata was inspected without decrypting values on
2026-11-05. It has reader AI configuration and no Microsoft app registration or
OAuth configuration. ChatGPT's connected Outlook account cannot supply an
application-owned grant to Road Ready.

## Required setup to activate

1. Register Road Ready in Microsoft Entra with personal Microsoft accounts enabled.
2. Use Microsoft's supported MSAL authorization-code flow with PKCE. Configure the
   exact production callback URI in the registration. Select the account explicitly.
3. Request delegated `Mail.Read` and `offline_access`; avoid send/write/delete scopes.
4. Configure the application client ID, server credential and callback URI. Store
   refresh tokens encrypted in an account-isolated server store, never browser
   local storage, URLs, logs or the Road Ready document backup. Bind the Microsoft
   grant to the authenticated Road Ready user. Disconnect must revoke/delete the
   stored grant and stop jobs.
5. Wire the adapter into a durable incoming-documents queue with unique constraints
   on account/message/attachment ID and per-account content hash. Keep mailbox
   cursors server-side and validate them. Add incremental folder delta tracking.
6. Start with an explicit import. Show a small list of new documents and route a
   chosen original through Smart Scan's existing review/save flow. No automatic
   load booking, log changes, replies or follow-up of email links.
7. Test consent, refresh, disconnect, account switching, paging, duplicate attachments,
   interrupted downloads and same-document resends against the connected mailbox
   before enabling background import.

Microsoft references checked:
- https://learn.microsoft.com/en-us/graph/api/message-list-attachments?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- https://learn.microsoft.com/en-us/graph/api/message-delta

The adapter is preparation for this connection, not a claim that mailbox import
is available. No mailbox access has been granted or email read by this change.
