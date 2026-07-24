# Road Ready module boundaries

Road Ready is split into independent modules so work on one capability cannot silently change another.

## Required document flow

```text
Capture or import
  -> scanner-core
  -> document-import
  -> document-router
  -> exactly one document reader
  -> records-vault

Logbook reads document references only. Document modules never mutate Logbook events.
```

## Independent modules

- `scanner-core`: capture, crop, perspective correction and image enhancement only.
- `document-pipeline`: immutable input/output contracts and reader registry.
- `document-readers/rate-confirmation`: rate confirmation extraction only.
- `document-readers/bol`: bill of lading extraction only.
- `document-readers/pod`: proof of delivery extraction only.
- `document-readers/fuel-receipt`: fuel receipt extraction only.
- `records-vault`: local files, metadata, weekly records, sealing and export/import.
- `logbook`: duty events, HOS source data and certified logs.

## Hard rules

1. Every module exposes a single `public-api.js`.
2. Cross-module imports use the public API.
3. Readers cannot import one another.
4. Scanner cannot classify, read or store documents.
5. Readers cannot modify files, routes, Logbook events or other readers.
6. Records Vault stores reader output but does not contain OCR or reader logic.
7. Logbook stores `documentId` references only.
8. Original document bytes remain immutable.
9. Reader output includes `readerName` and `readerVersion`.
10. Reader failure leaves the original document available.
11. A feature PR should modify one module. Cross-module changes require explicit contract changes.
12. Stored output shape changes require a migration and reader version change.

## Work on one reader

Example: improve Rate Confirmation reading.

Allowed paths:

```text
source/src/modules/document-readers/rate-confirmation/**
reader-specific fixtures and tests
```

Normally forbidden in that work:

```text
scanner-core/**
document-readers/pod/**
document-readers/bol/**
records-vault/**
logbook/**
```

The Rate Confirmation reader receives the same normalized document contract and returns only Rate Confirmation fields. POD and BOL results stay untouched.

## Definition of complete

A module can be marked stable when it has:

- a public API;
- frozen input and output contracts;
- unit fixtures for its own type;
- malformed and low-quality document tests;
- a non-mutation test for unrelated modules;
- a module version;
- no forbidden imports;
- a migration when persisted output changes;
- a release note stating allowed and unchanged behavior.

## Module locking workflow

```text
Specification
  -> module implementation
  -> module tests
  -> unrelated-module non-mutation tests
  -> boundary verification
  -> preview build
  -> stable module version
  -> lock
```

After locking, internal changes remain inside the module. Other modules consume the same public API. A breaking contract creates a new major version instead of silently changing existing behavior.

## Verification commands

```bash
node scripts/verify-module-boundaries.mjs
node scripts/verify-document-reader-isolation.mjs
node scripts/verify-records-vault-foundation.mjs
```
