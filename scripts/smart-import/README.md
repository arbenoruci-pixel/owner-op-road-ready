# Smart Import and My month

## 110.4.86 — Motive quarterly actual miles

Home → Import → **Import Motive miles — IFTA / IRP** accepts a jurisdiction
Distance Summary CSV, a selected year/quarter and the source truck number.
Per-row source vehicles and dates take priority; missing report dates can use
the explicitly reviewed quarter. Fleet aggregates require a truck. Raw columns,
source units, converted miles, period, original bytes and SHA-256 are retained.
No API subscription, paid integration, new backend or schema is introduced.

Quarter totals stay in their period and never become fabricated daily/monthly
miles. Manual logbook mileage, signatures, GPS and duty events stay untouched.
Home → My month shows a separate quarter/truck/state table, original reports,
and a distance-only CSV export. Imported coverage is explicitly distinguished
from a complete filed return or trip evidence; tax exemptions are not inferred.

Aggregate identities include period end and truck, independent of filename or
row order. Reimports count once. Changed totals, daily/monthly/quarter overlaps,
unknown legacy truck overlaps and conflicting sources block saving rather than
replace or double mileage. Conflicting historical versions stay outside totals.
An identical original cannot silently acquire another truck or period.

Originals are saved transactionally, then read back and hashed before projection.
An interrupted/quota-failed projection leaves the original staged for an
idempotent retry. Missing binaries restore to their existing metadata identity.
Tests cover all quarters/leap year, source dates/units, 20,000 trip rows,
overlaps in either import order, corruption, recovery, signed-log preservation
and actual Chromium/WebKit UI import/reimport, CSV download and mobile widths.
The build asserts authored files survive the full legacy materialization chain.

The sections below describe the existing statement and monthly functionality.

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
  unchanged. Release stamps advance to the nonforced 110.4.80 candidate.

## Verification and release scope

Release 110.4.80 includes Smart Import, My month and the account/index scheduler
fixes documented in `../reliability-sync/README.md`. It does not install the
broader HOS, historical edit or original-reference candidate from PR #231.

The focused suite covers CSV identity and conflicting sources, real Dexie
transactions using synthetic IndexedDB, rollback and quota recovery, unchanged
HOS locks, account changes, deadlines, save coalescing and actual installed index
capture/cache/finish boundaries. Production compilation and architecture checks
run on the final materialized runtime. The existing CI runs the complete build
and legacy browser workflows; release-label assertions track the actual release
while retaining their behavioral assertions.

`browser-import.mjs` uses the existing isolated account fixture to exercise the
actual Home, CSV review/save/reimport/conflict, zero-taxable mileage, original
logbook PDF storage and monthly UI in Chromium and WebKit. It checks retained
cross-month load identity, phone/tablet layout and unchanged logbook evidence.
The browser receive suite separately exercises actual account reconciliation
and IndexedDB with synthetic cloud transport. Real account services are blocked.

These client changes retain the existing storage format and do not rewrite
historical events or consolidate old financial rows. The complete live-data
restore and Chicago transition gates for PR #231 remain open. Private account
records, cloud file lists, authentication data and diagnostics are excluded from
this source change. Physical iPhone testing remains distinct from browser-engine
and viewport testing.
