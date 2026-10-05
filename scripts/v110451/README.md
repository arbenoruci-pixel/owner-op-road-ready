# Temporary record inspection and corrections

The device remains the local source. v110.4.51 indexes saved source records in Supabase alongside the separate full, byte-verified device backup. Each device has its own ID and records. It does not merge a phone and tablet or automatically reconcile similar BOL numbers.

## Data model

- `road_ready_record_devices`: last attempt, lease, completion, version and source counts.
- `road_ready_records`: current device projection, original locator, load/driver/day, revision and capture time.
- `road_ready_record_history`: prior revisions, including deletion markers.
- Typed views: `road_ready_loads`, `documents`, `logbook_days`, `duty_events`, `drivers`, `routes`, `wallet`, `signatures`, `inspections`, `forms`, `settings`, `expenses`, `files`, `recovery` (all with the `road_ready_` prefix).
- `road_ready_corrections` and `road_ready_correction_history`: requested changes and device-confirmed results.

Rows with origin `backup_review` came from an already verified backup. They are read-only reference material. Only a completed device run establishes a current live index. The first complete run retires those review rows while preserving their history. Files remain in the independent private backup; the record index contains file descriptors, not duplicate base64 originals or auth credentials. Historical app snapshots are listed by identity; their complete contents remain in the full backup.

## Inspect and correct

1. Query by the approved owner AND exact device ID. Inspect device completion time and app version first.
2. Read the source record and relevant original evidence. Different load numbers, even on the same route, do not establish identical jobs. Identify shortened BOL aliases using original documents and pickup evidence.
3. Queue a small correction through the private administrative function with the exact current revision:

```sql
select owner_op.queue_record_correction_v1(
  '<owner-uuid>', '<device-uuid>', 'business/loads/<source-id>',
  <observed-revision>, '{"broker":"Verified broker"}'::jsonb,
  'Broker verified from the original rate confirmation'
);
```

The function is not executable by public, anon or authenticated device roles. Device roles can acknowledge only status/result/time. No service key is exposed to the app.

4. On the target device open `/cloud` → Records & corrections → Apply correction. Other app editing tabs must be closed. The source must exactly match the recorded before-data. If it changed, both versions remain and the correction becomes a conflict.
5. Verify `status='applied'`, the new live record, and its revision history after synchronization. Pending means it has NOT yet been applied to the device. A network failure after the local write is safely retryable through the durable local journal.

To undo a completed correction, inspect the current source and queue a NEW correction restoring the prior fields at the NEW revision. Use `p_unset` for fields that did not exist before. Never rewrite history or an already completed correction. Duty hours, forms, signatures, driver membership and settings are inspectable but must be edited through their original app workflows.

## Operation and local-only return

Automatic metadata sync starts after 15 seconds and checks every 90 seconds while visible and online; unchanged records use hash references. Only a complete counted run marks absent records deleted. Offline work stays local. The Cloud page has manual sync and a pause/resume control for both indexing and full backups on that device. Server `record_sync_enabled` is per approved owner. `review_after` is informational, never an automatic deletion deadline.

After the stabilization period, export a full verified ZIP, test its restore on another device, compare originals and driver-day/signature counts, then separately authorize disabling cloud writes. Cloud removal is a separate explicit action after retention and recovery are settled.

## Validation

- `node scripts/v110451/test-records.mjs`: driver identity, active source, original preservation, credential redaction, fragments, exact conflict, idempotence and protected-field checks.
- `test-database.sql`: run as admin after replacing owner/claims placeholders for an approved test owner. Entire test is rolled back. Covers authenticated RLS, wrong-owner isolation, revision history, leases, stale hashes/runs/counts, administrative queue and immutable correction payloads.
- `node scripts/v110451/browser-records.mjs`: production browser path with fully mocked external requests and synthetic account. Covers incremental index, read UI, editing lock, durable correction and ack retry, metadata writes, conflicts, offline/pause/reload, original bytes and both drivers' logs/signatures.
- No test should write synthetic data into a real user's persistent cloud records.

## Duplicate source identities (v110.4.52)

Legacy rows may share a saved ID. The index retains every occurrence with a distinct record key and marks its locator as duplicate. These rows remain read-only for remote corrections until the source identity is reviewed. A correction queued before the duplicate was discovered also rechecks the complete source collection and stops on ambiguity. No local IDs, load fields, originals or duty records are merged or deleted during indexing.
