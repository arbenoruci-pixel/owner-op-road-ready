# Durable, quiet account synchronization

This candidate replaces repeated immediate sync triggers with one queue while retaining the existing active-device and account authorization rules. It does not change Motive, account permissions, subscriptions, cloud schema or permanent access.

## Causes and resulting behavior

Navigation and normalization were causing durable snapshots to emit business-change notifications even when the shared records were unchanged. The new snapshot comparison keeps navigation durable locally while avoiding unnecessary account work. Receiving business/profile settings is tagged as account input so it does not create a new outgoing loop.

The scheduler coalesces saves, gives working records priority over original-file archives, and retains dirty versions until a successful acknowledgment. Temporary conflicts and busy work use bounded retry delays; failed transfers back off with jitter. Saving or waking while offline does not create repeated initial attempts. A verified working-record handoff opens the logbook while document originals continue in the background; a failed handoff remains blocked.

Normal progress appears as a small delayed indicator. Real errors keep their identity through retries, remain visible until the relevant scope succeeds, and do not create repeated announcements. An archive error cannot be cleared by an unrelated records-only success.

Differing recorded versions require explicit review, including exact local and account values. Both versions are retained in a recovery journal before a choice can be applied. If either version changes during review, the old choice is rejected and the UI clears the selection. The existing device lease still guards all reads and writes; it is not treated as approval to overwrite a historical log.

## Verification

Run the installers only after the repository's existing build has materialized the latest runtime, or use the final `scripts/build-v110.mjs` pipeline.

```sh
node scripts/reliability-sync/scheduler.test.mjs
node scripts/reliability-sync/snapshot.test.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/road-ready-test-browsers node scripts/reliability-sync/browser-receive.test.mjs
```

Verified in the isolated integrated candidate:

- 10 scheduler groups: coalescing, record/archive ordering, inflight saves, retries, offline and conflict pause behavior.
- 6 snapshot/status groups: semantic record changes, local-only navigation, durable event scope and stable error identity.
- 19 actual IndexedDB/Dexie/account transport scenarios in Chromium: handoff, failed handoff, interrupted archives, original reuse, recovery failure, stale conflict choices, account mismatch, device-generation changes and export staging exclusion. Cloud I/O and device-session responses in this suite are synthetic. The HTTP fixture returns independent response values, matching real response semantics.
- The actual AccountSyncGate also passed three targeted scenarios in both Chromium and WebKit through `scripts/reliability-audit/gate-browser.test.mjs`: records open before an unavailable archive, failed records stay blocked, and changed conflict versions require a fresh choice. The tested conflict views have no horizontal overflow at 320, 390 or 820 pixels.

## Remaining gates

A cold offline reopen still requires the app's existing online active-device verification. This work does not weaken or replace that access rule. A physical iPhone/iPad check, live cross-device validation against the actual Road Ready backend, a coordinated client/schema rollout, and a verified restore of the complete live backup are required before production activation. Synthetic transport tests do not establish those production outcomes.
