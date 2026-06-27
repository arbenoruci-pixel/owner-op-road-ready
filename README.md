# Owner-Op Road Ready

Next.js App Router application for an ELD-exempt owner-operator manual logbook and digital wallet.

## Current foundation

This repository has been migrated away from the old Vite/static `dist` deployment. The production entrypoint is now the root Next.js app under `app/`.

## Commands

```bash
npm install
npm run test:offline
npm run build
npm run dev
```

## Required environment

Create `.env.local` from `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Supabase setup

Apply migrations in order:

```bash
supabase/migrations/001_core_schema.sql
supabase/migrations/002_rls_policies.sql
supabase/migrations/003_storage_policies.sql
```

See `PHASE_2_IMPLEMENTATION.md` for the Phase 2 architecture notes.
