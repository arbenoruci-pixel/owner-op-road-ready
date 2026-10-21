# Smart Import and My month — proposed 110.4.79

Fuel statements can currently be counted in both the owner ledger and business
ledger; repeated imports can add further business rows. The two CSV entry
points also read different column aliases, and mileage import replaces an
explicit zero taxable value with total miles. Historical rows inherit the
active load even when the source names no load.

This change provides one reviewed statement import and a monthly view of the
existing records. It targets the existing application on `main`.

## Behavior

- Home → **Import** accepts fuel, state-mileage and toll CSV statements, and
  original logbook PDFs from Motive or another selected ELD provider.
- Preview shows the source period, totals, new rows, duplicates, conflicting
  versions and invalid source rows. Invalid or conflicting input blocks saving.
  Provider, account and workspace participate in transaction identity. A trip
  ID retains its separate mileage jurisdictions. Renaming or reordering a
  statement does not create fresh financial identities.
- New fuel rows have one canonical owner in `business.fuel`; tolls use
  `business.expenses`; mileage uses the existing owner store. Historical fuel
  and toll mirrors are reconciled for reading using exact transaction evidence.
  Conflicting historical versions are retained outside totals for review.
  IFTA export stays blocked while conflicts, invalid source rows or unconfirmed
  taxable mileage remain.
  Existing stored history is not consolidated or deleted.
- The CSV original and a recovery journal commit in one IndexedDB transaction
  before the single-store financial projection. The final snapshot and account
  are checked again before writing. An interrupted or quota-failed projection
  keeps its staged original and supports an idempotent retry.
- Motive/ELD PDFs retain their original bytes, selected driver, source period
  and report timezone. The report is read-only. The source date range is
  explicitly distinguished from individually verified daily logs.
- Home → **My month** shows saved local logs, original ELD reports, state
  mileage, fuel, load documents, expenses/settlements and wallet expirations.
  Loads and source reports spanning months retain their original identities.
  Invalid dates and unresolved transaction conflicts remain visible.
- Existing IFTA, Connections, scanner statement intake and document-folder
  mileage launchers use the same import rules. Source load references are
  retained; the active load supplies no fallback reference.
- The existing terminal policy, duty events, signatures, HOS modules,
  authentication, permissions, cloud schemas and service-worker behavior remain
  unchanged. Release stamps advance to the nonforced 110.4.79 candidate.

## Build

The final installer runs after the current main materialization chain. Edit the
templates in this directory; generated `source/` copies are build output.

Two existing clean-build predecessor defects were also reproduced and repaired:
the parts-counter catalog installer assumed an optional negative-signals array
already existed; the native PDF installer assumed the v110348 page reader even
when the exact earlier v110347 reader was retained. Both fixes require the known
predecessor and preserve the existing classification and PDF regression gates.
The unchanged 18-case route-day regression runs after the completed freight
projection, rather than against an intermediate materialization stage.

```sh
npm ci --no-audit --no-fund --registry=https://registry.npmjs.org/
node scripts/build-v110.mjs
```

For the separate in-memory IndexedDB persistence tests, install the test-only
dependency without changing the production dependency graph:

```sh
npm install --no-save --package-lock=false fake-indexeddb@6.2.4
node --test scripts/smart-import/core.test.mjs \
  scripts/smart-import/storage.test.mjs \
  scripts/smart-import/runtime.test.mjs \
  scripts/smart-import/indexeddb.test.mjs
```

The tests exercise actual Dexie transactions with synthetic source files and
account data, including original-byte verification, rollback, quota recovery,
reimport, account changes and concurrent saves. The runtime tests verify all
frozen file hashes. All 46 focused tests passed, together with Next production
compilation and the existing architecture/module-isolation checks, against the
materialized current application. Browser and physical-device verification of
the new screens remains pending.

A fresh all-in-one clean build is **still blocked before Smart Import runs** by
the existing `scripts/v110379/install.mjs` App.jsx predecessor check: the source
has SHA-256 `a7d0a146852c574ba4e1cc6237314caf9d8d146ae22a599c06094027402e361e`,
while that installer requires
`9fa786c626b5e796ad0c06ac51020bc2c28797bf770ba72284ba79311c032572`.
The checksum check is retained. Its exact source/version chain needs a separate
repair and a successful complete clean build before this candidate can activate.

## Live activation status

Publication to main was already authorized. The complete live-backup restore
requirement is still unmet. A signed-in inspection reached the full-device
export, but the browser refused the download and could not safely resume its
native credential state. A complete current file was never retrieved or
restored. Backend access to retrieve an alternative complete copy was also
unavailable in this session. Private account data is excluded from this change.

Keep this candidate in draft until a current complete Export Everything file,
including source originals, can be restored in an independent environment and
checked against its source. Review actual redacted Mudflap/Motive exports and
the iPhone workflow before activation. The separate reliability/HOS candidate
in PR #231 and its Chicago transition remain pending; this change does not
silently activate that candidate or move historical log events.
