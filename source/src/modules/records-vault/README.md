# Records Vault

Local-first weekly records for an owner-operator with their own authority.

## Scope

This module owns:

- weekly record folders;
- document metadata;
- local document files;
- soft delete and restore while a week is open;
- sealing a completed week;
- amendments after sealing;
- export and import package integrity.

It does not own or modify Logbook, HOS, routes, duty status, certified logs, GPS, or document scanning.

## Essential document types

- daily logs;
- BOL;
- POD;
- rate confirmation;
- fuel receipts;
- toll, scale, lumper, parking and repair receipts;
- inspections;
- settlements;
- other supporting documents.

## Weekly flow

1. `createOpenWeek`
2. capture/import a file and call `saveDocumentFile`
3. create metadata with `createDocument`
4. add it with `addDocument`
5. check `auditReadiness`
6. call `sealWeek`
7. create a portable package with `createWeeklyPackage`
8. save a second copy outside the app using the device Files/Share interface

## Safety rules

- active weeks can add, soft-delete and restore documents;
- sealed weeks cannot be edited directly;
- later changes are recorded as amendments;
- documents reference Logbook or load records by ID only;
- files are stored in IndexedDB for web/PWA;
- a future mobile adapter will use SQLite plus the native file system;
- export packages include schema and checksum information;
- production integration must never write directly to Logbook state.

## Next integration step

Create a small `Weekly Records` screen that consumes only `public-api.js`. The screen should list weeks, show missing BOL/POD/log items, add files, seal a week and export the package. Keep the first release independent from the existing Logbook screens.
