# Load and week transfer — 110.4.12

Documents now provides Export week / Import week on a week, Export load /
Import load inside a load, and both import choices on the Weeks landing page.
A JSON package includes original file bytes, complete document metadata, load
details and source folder dates. A week includes its load folders, other dated
documents, and business fuel/expense/maintenance/settlement records dated within
that week. A load includes records explicitly assigned to its exact load number.
Multiweek loads keep their whole document folder in a weekly package.

Exports fail visibly if an original cannot be retrieved; they never present a
partial transfer as complete. Cloud originals use the existing authenticated
read-original endpoint. Packages have a 100 MiB file limit; large weeks can be
transferred one load at a time. Save / Share uses a separately prepared File so
the iOS share call happens within the driver's click.

Import validates format, scope, all original sizes and SHA-256 values before
showing a preview and again on Apply. It merges additively by stable identities,
keeps local edits, refuses conflicting original bytes, and can restore a missing
original. A unique client identity matches documents already pulled on another
device even when their local keys differ. Restore checks the saved hash and size
before writing, and business mirrors retain the same original hash so loose
documents are counted once. Dated unassigned originals are selected directly as
well as through the selected week's precomputed document list.
New archive loads do not activate a trip. All originals and vault rows
are written in one IndexedDB transaction. A strict business-store write aborts
that transaction on quota failure, and a subsequent transaction failure restores
the previous business-store value. The importer rescans current records on Apply
and serializes concurrent imports where Web Locks is available.

Driving events, route legs, signatures, inspections, driver profiles and cloud
mutation queues are not imported or rewritten. Imported document event pointers
are detached; source folder dates are archive organization only. This feature is
for the Documents screen; full driving-log transfer remains in device backup.
Native phone/iPad Save to Files, file picker and installed PWA update need a
physical-device check. Browser coverage uses synthetic persistent Chromium and
WebKit profiles with account/cloud calls blocked.

## Verification

- Pure contracts: scope selection, mirrored identity deduplication, distinct
  same-type originals, original bytes and Reader metadata, missing/corrupt files,
  incompatible versions, scope mismatch and non-destructive repeated merge.
- Browser contract: source load/week export, file chooser, preview/cancel, quota
  rollback, fresh-device import, reload, repeated import, byte-identical re-export,
  unrelated business and log preservation; 320/390/820 pixel widths.
- Existing ordered build, architecture, duty continuity and runtime locks.

Local result: the final materialized production compilation and Chromium flow
pass, including preservation of a newer local document title and restoration of
a deleted original. Architecture, all 11 runtime locks and 11 duty-continuity
groups pass. WebKit is installed but cannot launch in this execution environment
because required system libraries are unavailable. The default CI test still
runs both browsers. The user approved publication on September 27, 2026; the
release requires the fresh full-chain CI checks before merging and deployment.

## Phone/iPad sequence

Open Documents → week → Export week (or open a load → Export load), then
Save / Share transfer → Save to Files. On the other device open Documents,
choose the corresponding Import button, select that JSON file, review its load
number/date and counts, and tap Import now. Reopen the week/load and an original.
Import it a second time and verify the counts do not grow. Confirm that the
active driver's current log and active trip remain as they were.
