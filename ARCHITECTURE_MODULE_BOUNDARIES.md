# Road Ready module boundaries

Road Ready is split into independent modules so work on one capability cannot silently change another.

## Required flow

```text
Capture or import
  -> scanner-core
  -> document-import
  -> document-router
  -> one document reader
  -> records-vault

Logbook reads document references only. Document modules never mutate Logbook events.
```

## Modules

- `scanner-core`: image capture, page crop, perspective correction and image enhancement only.
- `document-import`: accepts files, preserves the original and creates a normalized document input.
- `document-router`: selects a reader from explicit type or classification evidence.
- `document-readers/rate-confirmation`: extracts rate confirmation fields only.
- `document-readers/bol`: extracts bill of lading fields only.
- `document-readers/pod`: extracts proof of delivery fields only.
- `document-readers/fuel-receipt`: extracts fuel receipt fields only.
- `records-vault`: stores files, metadata, weekly records and exports.
- `logbook`: owns duty events and certified logs. It may store a `documentId` reference only.

## Hard rules

1. Every module exposes a single `public-api.js`.
2. Cross-module imports must use `public-api.js`.
3. Readers cannot import one another.
4. Scanner cannot classify documents or write to the Vault.
5. Readers cannot modify files, routes, Logbook events or other readers.
6. Records Vault stores reader output but does not run reader logic.
7. Logbook never imports scanner or reader internals.
8. Original document bytes are immutable.
9. Reader output is versioned independently by reader name and reader version.
10. A reader failure returns an error result and leaves the original document available.

## Definition of complete

A module can be marked stable when it has:

- a public API;
- input and output contracts;
- unit fixtures for its own document type;
- a non-mutation test for unrelated modules;
- a module version;
- no forbidden imports;
- an explicit migration when stored output changes.

After a module is stable, new work should add a compatible public API function or a new version. Internal files stay private.
