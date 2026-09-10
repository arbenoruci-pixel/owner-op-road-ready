# Elapsed Insert inside the current duty status

The installed-phone screenshot shows ON 22:39–22:40 inside a current SB event.
`replaceInterval` treats every live row as protected through minute 1440, so
Insert rejects that elapsed minute and disables Save with “The current live
event cannot be overwritten. End it using Change status first.”

The 110.3.13 finalizer adds a narrow Insert adapter. After the existing command
has validated the original day snapshot, it permits an elapsed interval inside
one current OFF, SB or ON row. The ordinary interval command splits the past
time, and the original row ID/source continue after the inserted interval.
Current status, recording sessions and unrelated state are retained. An Insert
ending at Now retains the app's existing one-minute raw live sentinel, which
projects to Now and grows normally. The existing edit history stores the exact
before/after rows. Automatic Driving and current Driving protections remain.

For the screenshot fixture, the intended result is SB to 22:39, ON 22:39–22:40,
then the same current SB continuing from 22:40. This change affects the Insert
preview/Save contract; it does not redesign graph handles or the form layout.

## Validation

- 19 regression groups pass on the materialized runtime from PR #59 workflow
  34419092624, artifact 10130301308. The archived versioned inputs were compared
  with main c79e94ec34e5a3b3639a4090487a27fa173471e8 and matched.
- Cases cover OFF/SB/ON; an interior interval, the screenshot minute, the entire
  elapsed live row, and an interval crossing its earlier boundary; unique IDs;
  preview immutability; preview/Save parity; JSON serialization/reprojection;
  repeat Insert; stale snapshots; future/live/automatic Driving guards; mileage;
  historical Insert; and preservation of voided/display-only records.
- All 11 isolation locks pass. No existing locked module is changed.
- Next production compilation on that materialized runtime plus the candidate
  succeeded. This is distinct from a clean materialization/build of the branch.

## Remaining release gates

Local builds of unchanged main failed before this finalizer: Node 24 reached
`finalize-canonical-continuity-v11026b.mjs` and missed the historical carried-day
anchor; Node 20.20.2 failed in `apply-v10959-isolated-document-engines.mjs` with
“missing production document-engine import.” These earlier build steps and
their assertions have not been modified by this change. The branch's exact
source build must pass before release.

The session's cloud browser rejects the local test server with
`ERR_BLOCKED_BY_CLIENT`. Pointer dragging, actual UI persistence and the
installed iPhone/PWA therefore remain unverified for this candidate.

Before release, verify with synthetic records on the target phone/build:

1. Open Insert with a current SB row; select ON 22:39–22:40 after that time has
   elapsed. Both time fields and graph handles must update the preview.
2. Preview must show disjoint SB / ON / SB intervals and an enabled Save. Cancel
   must leave the original records unchanged.
3. Save must persist exactly that ON minute, retain the current SB, and retain
   the before/after edit history. Close/reopen the installed app and check the
   same row and continued SB duration.
4. Repeat with active OFF and ON, including an Insert ending at Now. Verify
   that future time, automatic Driving and current Driving remain protected.

No production deployment or real phone records were changed during this review.
