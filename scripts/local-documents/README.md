# Local originals — 110.4.111

User-authorized scope, November 7, 2026: keep document originals on their device;
only send selected originals when creating a link. Preserve existing cloud files
and all logbooks. No live user records or storage objects were mutated for this
change. Supabase's active HTTP 402 restriction is independent of local saving.

## Coverage

- Scanner aliases both use an atomic IndexedDB metadata + original transaction,
  then read back and hash bytes before success. A failed/quota save stays open.
  Byte-identical retries reuse the original; resumed scans retain identity and
  cannot overwrite different bytes. Synced originals are never purged for space.
- Wallet waits for the existing snapshot writer's matching acknowledgement and
  verifies its document in IndexedDB before closing. It never writes a stale
  whole-app snapshot from the document editor.
- Account merge excludes document tables, business document records, the wallet,
  and nested/serialized original-bearing records from outbound reconciliation.
  It preserves both the phone's originals and existing remote original records
  independently. Absence from a cloud manifest cannot delete a local document.
  Existing logbook synchronization semantics and signatures remain unchanged.
- The metadata index redacts embedded files even inside serialized recovery data.
- Full cloud mirror and pending full migration cannot upload. Legacy scanner
  endpoints reject uploads and queued document work becomes a local no-op.
  Historical cloud download paths remain; no cloud garbage collection is added.
- The existing three-step DOT wizard has document checkboxes in Review. Its
  immutable sharing client receives the explicit selected keys, verifies selected
  hashes, and leaves local originals/logs unchanged on HTTP 402 or upload failure.
  The cloud vault also lists current-phone selections without requiring backup.

## Backup and transfer

IndexedDB belongs to this app's browser installation on this device. Device loss,
cleared website data, app removal, browser eviction, or a different device can
make originals unavailable. A PWA installation and a sharing link are not a full
backup. Do not erase the original phone before checking a separate copy.

Use **Tools → Backup Logs → Export Everything**, save the generated ZIP to
**Files → iCloud Drive**, and use **Verify saved backup from Files** to check the
saved file. Keep a second copy on a computer or external drive. A ZIP that reports
missing originals is incomplete; keep that phone and recover those files first.

For transfer, copy the verified ZIP to the new device and keep the old device
intact. The existing full restore replaces device records, including logbooks;
review that separate action before using it on a device with existing work.
For documents alone, **Export Docs + Logbook (ZIP)** provides readable originals
for manual import without restoring or overwriting a logbook. Export and verify
a fresh backup after adding important documents.

## Verification

Final materialized runtime tests cover IndexedDB persistence/reopen and atomic
rollback, quota failure without eviction, resume identity, wallet acknowledgements
and readback, real account receive with missing/different cloud originals, HTTP
402, serialized-file redaction, retired upload entry points, selected-only uploads,
and the actual three-step React workflow. Approved DOT and module locks run
before the production compiler. Preview deployment is disabled for this branch.

The live backend probe explicitly reports HTTP 402 as blocked/unverified, so the
quota incident cannot prevent compilation of this local-only fix. It makes no
claim that Auth or private-bucket checks passed while the project is restricted.
Reachable Auth, anonymous-RPC, and private-bucket assertions remain strict.
