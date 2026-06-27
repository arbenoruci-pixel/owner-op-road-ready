# Phase 2 Implementation Notes

This patch moves the project foundation from the old Vite/static `dist` deployment into a Next.js App Router foundation and adds the backend/offline-first architecture approved for Phase 2.

## Implemented

- Next.js App Router entrypoint under `app/`.
- Vercel config updated to run `npm install` and `npm run build` with Next.js framework detection.
- Removed the root static `dist` deployment path.
- Supabase migrations for:
  - `profiles`
  - `drivers`
  - `driver_signatures`
  - `log_days`
  - immutable `duty_events`
  - `current_duty_events` view
  - `documents`
  - `document_links`
  - `sync_mutations`
  - RLS policies
  - Storage bucket/policies for `driver-documents`
- Next.js Route Handlers:
  - `POST /api/sync/push`
  - `GET /api/sync/pull`
  - `POST /api/documents/create-upload`
  - `POST /api/documents/commit-upload`
- Dexie/IndexedDB database foundation:
  - app snapshots
  - local log days/events/documents
  - document blobs
  - mutation queue
  - id mapping table
  - sync metadata
- Replaced `localStorage` persistence with IndexedDB snapshot persistence.
- Added mutation queue logic for duty event create/edit/void diffs.
- Added document upload queue helper and Supabase Storage upload/commit sync path.
- Added iOS-safe active app sync triggers:
  - app startup
  - online event
  - visibility change
  - periodic retry while app is visible
- Added service worker message bridge for browsers that support Background Sync.
- Added pure smoke test for sync payload/retry logic.

## Important remaining integration item

The sync engine is ready, but it intentionally does not invent an auth UI. It waits for an access token provider:

```js
window.ownerOpGetAccessToken = async () => '<supabase-access-token>';
```

Once Supabase Auth is wired into the app shell, the queued mutations will be pushed through the API routes.

## Commands

```bash
npm install
npm run test:offline
npm run build
```

## Environment variables

Copy `.env.example` into `.env.local` and provide:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```
