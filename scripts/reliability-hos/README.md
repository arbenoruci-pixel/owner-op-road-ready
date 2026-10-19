# HOS reliability review candidate

This directory contains the isolated HOS, historical-editor, carrier-profile, and home-terminal-time candidate prepared against the fully materialized Road Ready `110.4.77` runtime at source commit `f19e2cea3c3fb4aa6eeb852aefb9f1e2ea522181`. Code was frozen after the verification below. This README documents the candidate; it does not authorize production publication or changes to live records.

## Installation and ownership

Run `install.mjs` **after all historical materializers and finalizers**. Editing generated `source/` files directly is not a durable change in this repository. Root `scripts/build-v110.mjs` owns final installer ordering and the reviewed release/lock revision.

The installer accepts the path to an isolated materialized checkout, asserts its expected source contracts before writing, and is idempotent. Its source assets are this directory, independent of the target checkout. Command examples use `/tmp/road-ready-hos-runtime` for a chosen independent test checkout; substitute your own materialized checkout path.

```sh
node scripts/reliability-hos/install.mjs /tmp/road-ready-hos-runtime
```

The first clean installation changed 31 source/lib files. A second installation preserved all 491 source/lib file SHA-256 hashes in the independent fresh-install fixture. Copies used ordinary independent file copies, not hardlinks. No production state, Motive integration, credentials, active-device permissions, billing settings, or subscriptions were changed by this work.

## Reproduced defects and resulting behavior

| Defect in the materialized baseline | Candidate behavior |
| --- | --- |
| Historical ranges stopped at the selected day while current clocks could consider an overnight sleeper partner. A completed overnight split could leave a false prior-day 14-hour range. | Current clocks, historical review, graph ranges, signing review, and DOT review delegate to the same evidence/rule calculation. Historical review includes a bounded subsequent witness period for an actual recorded partner. |
| Cycle calculations differed between moving-time availability and historical ranges, including an old cumulative/hardcoded cycle path. | Both consumers use the selected carrier cycle and carrier duty-period boundary. An explicitly confirmed consecutive-24-hour anchor also supplies graph recapture boundaries after DST. |
| ON time beyond a cycle limit could be reported as a driving violation. | ON contributes to cycle usage and future driving availability. Cycle, 11-hour, and 14-hour violation ranges attach to Driving. |
| A full 10-hour sleeper period could discard an otherwise valid preceding split or be unavailable as part of a later split. | Full resets and qualifying split pairs are both considered. Tests cover 3 OFF + 10 SB, 10 SB + later 2 OFF, and repeated 8/2 pairs. Pair selection prioritizes supported compliance and available hours. |
| A 9-hour-59-minute explicitly ended rest could gain time across an unknown gap. | Explicit end boundaries remain explicit. Gaps and overlaps are evidence requiring review, not rest. |
| A missing SB-to-OFF transition could extend the last SB record into a qualifying long sleeper period. | A last SB event is not carried through an unsupported different current status. The missing interval stays an explicit review item. |
| Clocks could show Review for an unconfirmed profile while graph ranges still looked confirmed. | Unknown applicability and uncertain cycle boundaries also make affected ranges potential/review items. A default value is not a confirmed carrier profile. |
| Several clock surfaces refreshed only when app state changed. | A local minute/focus/visibility hook refreshes derived clocks without writing app or sync state. |
| Editor graph drafts and Save could use different projections, and historical changes lacked the new explicit draft approval. | The review and Save use the same edit/insert commands, show changed neighboring boundaries and HOS effects, and require approval of the exact historical draft. Bulk shifts receive the same review/approval treatment. |
| Same-day backup restoration normalized exported event contents, and timezone/edit evidence could be lost across day transfer or driver switching. | Same-day restoration clones the exported event objects. Day timezone and edit history travel with the driver, day backup, and atomic account day record. Restore adds its own before/after audit entry. |

The latest baseline already retained edit history for metadata-only edits. This candidate preserves and tests that behavior; it is not claimed as a newly discovered missing-history fix.

## Evidence model and rule/profile limits

- `timeline.js` constructs derived UTC intervals from recorded status events, recorded day zones, and supported ongoing status. It does not edit raw events or fill unknown intervals with rest. Repeated/nonexistent DST minutes need recorded instant/fold evidence.
- `rules.js` owns current availability and historical ranges. Incomplete split pairs are explicitly conditional and show the remaining partner requirement. Genuine supported driving violations remain visible after later rest.
- `profile.js` stores explicit carrier-profile proposals or prospectively confirmed profiles with a source and previous-profile history. The implemented regime is U.S. interstate property-carrying rules. A different regime or unverified applicability remains a review item.
- A calendar day spanning DST is not silently asserted to be a verified consecutive-24-hour carrier period. The candidate flags an affected fallback cycle boundary unless a confirmed anchor is available.
- The available private diagnostic evidence covered one log day. It could not establish the user's full preceding cycle, complete rest sequence, or two-device chronology. Synthetic reproductions establish the code defects above, **not the precise date/cause of the user's personal incident**.

The team's rule review used current primary sources, including [49 CFR 395.3](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-A/section-395.3), [49 CFR 395.1](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-A/section-395.1), [49 CFR 395.8](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-A/section-395.8), and FMCSA's July 2026 [3 OFF + 10 SB](https://www.fmcsa.dot.gov/regulations/hours-service/if-driver-takes-3-hours-duty-and-then-10-consecutive-hours-sleeper-0) and [10-hour rest paired with a later rest](https://www.fmcsa.dot.gov/regulations/hours-service/can-driver-pair-rest-period-10-consecutive-hours-includes-7-consecutive) guidance. Actual carrier applicability still requires confirmation.

## Chicago remains pending

The requested target is `America/Chicago`; the observed old home-terminal setting was `America/New_York`. `timePolicy.js` and `TimeZoneSheet.jsx` prepare a reviewable proposal containing the requested first log day and instant. Saving it:

- Records `effectiveAt: null`, `proposedEffectiveAt`, and `status: 'pending_boundary_review'`.
- Preserves active ET, recorded event contents, existing signatures, and edit history.
- Pins previously recorded log-day zones so future configuration cannot silently reinterpret them.
- Shows the 60-minute ET-to-CT boundary gap and asks for actual event-boundary evidence; no rest is fabricated.

The candidate includes lookup support and synthetic tests for validated effective timezone history, but the live-setting UI does **not** activate that history. Safe app-wide rollover and the actual transition boundaries remain prerequisites for activation. The prospective timezone authorization does not authorize historical log corrections.

## Verification commands and actual results

Commands below ran against isolated generated source and synthetic data. They did not connect to or modify the live account. Browser routes stub authentication/services and block external writes.

### Pure rules

```sh
node scripts/reliability-hos/test.mjs
```

**29 groups passed.** Coverage includes cycle recapture and ON/D distinctions, exact 60/7 driving ranges, completed/pending overnight split, 10-hour pair alternatives, repeated pairs, insufficient SB, explicit gaps, status mismatches, overlaps, genuine retained 11/14-hour ranges, continuous 30-minute interruption, 34-hour restart, non-midnight duty periods, DST elapsed durations/ambiguity, Chicago preservation, historical review outside the live lookback, and prospective profile provenance.

### Installed runtime

```sh
node scripts/reliability-hos/test-runtime.mjs /tmp/road-ready-hos-runtime
```

**8 groups passed.** They exercise actual installed public HOS functions, metadata edit history, stale-event/neighbor refusal, exact day export/restore/reopening, atomic account day metadata/conflicts, historical certification context, driver switching, and JSX/client-directive correctness.

The materialized checkout needs its normal Next.js dependencies. If those dependencies are intentionally kept in another test checkout, set `ROAD_READY_TEST_DEPENDENCIES` to that checkout for the JSX parse gate.

The same eight groups passed after a fresh installation into `/tmp/road-ready-hos-fresh-install-check`, an independent source/lib replica of the clean materialized baseline. A subsequent installation preserved all 491 source/lib file hashes.

The first full Next run exposed an import-before-`use client` defect and an unqualified React effect reference in the new integration. Both were corrected before successful browser verification. The runtime suite now checks that any `use client` directive is an actual leading AST directive, which a syntax-only parse had failed to enforce.

### Full app: Chromium and WebKit

Next served the integrated test runtime at `http://127.0.0.1:3017`. Install the optional Playwright dependency and matching browsers using the [release test setup](../reliability-release/README.md). The browser test first resolves an ordinary local `playwright` installation. `CODEX_PRIMARY_RUNTIME_NODE_MODULES` is an optional fallback directory containing a separate Playwright installation.

From the fully materialized test checkout, start Next directly so the legacy `predev` materializers do not overwrite the candidate. These HOS tests mount the account UI with synthetic services; leave `VERCEL_ENV` unset so `/` does not redirect to the sample preview:

```sh
env -u VERCEL_ENV node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3017
```

Run the following commands from the checkout containing the test scripts. Each writes to its own chosen `/tmp` result folder:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/road-ready-test-browsers \
TEST_ORIGIN=http://127.0.0.1:3017 \
HOS_BROWSER_ARTIFACTS=/tmp/road-ready-hos-results/chromium \
  node scripts/reliability-hos/browser-test.mjs /tmp/road-ready-hos-runtime
```

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/road-ready-test-browsers \
TEST_ORIGIN=http://127.0.0.1:3017 \
HOS_BROWSER_ENGINE=webkit \
HOS_BROWSER_ARTIFACTS=/tmp/road-ready-hos-results/webkit \
  node scripts/reliability-hos/browser-test.mjs /tmp/road-ready-hos-runtime
```

Both engines passed at **390 × 844** phone and **820 × 1180** tablet viewports, with touch enabled and device timezones Honolulu/Los Angeles. Optional `HOS_DEVICE=phone` or `HOS_DEVICE=ipad` selects one viewport. Browser launch required approved sandbox escalation on this host; isolated WebKit dependencies were provided in `/tmp` without system changes. The historical runs used `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` only because verified host libraries were extracted locally. Normal browser installations should use Playwright's supported host dependencies without that override.

Every flow verifies ten substantive assertions: old-day ET on another device zone; read-only draft; exact event/neighbor/HOS preview; required approval; Save matching the preview command; preserved prior attestation and before/after audit history; exact reopening; pending Chicago leaving active/raw/signature/history intact; persistence after reload; and unsupported/unverified HOS settings saving only as a proposal. **No page runtime errors occurred in the successful flows.** Screenshots were visually inspected. This is browser-engine and viewport coverage, not a physical iPhone/iPad test.

Chromium results/screenshots are in `/workspace/scratch/e06b4e0f08ac/road-ready-evidence/hos-ui/`; WebKit equivalents are in `hos-ui-webkit/`. Each contains `results.json` plus phone/tablet edit preview, approval, Chicago proposal, and profile proposal images. These evidence directories are outside the source repository.

## Backup, publication, and older-client gates

The full source Git bundle and available diagnostic exports were copied and restored in isolation with matching content hashes before candidate changes. A prepared full live-account export could not be transferred because of the browser credential-protection restriction. **A full live-data restore was therefore not verified.** The production data-change and publication gates remain closed; synthetic day-transfer tests do not substitute for that restore.

Updated `accountCoreV110455.js` keeps `logTimeZoneByDay`, `logbookEditHistoryByDay`, and `hosProfileByDay` in the same atomic signed-driver-day record. Timezone and HOS profile histories remain working account state. Older clients do not recognize the new day fields. A coordinated version/schema gate for all writing devices is required before enabling this candidate against production synchronization; the HOS work does not itself implement that access gate or change the active-device lease.

Before production use: obtain and verify the complete live backup/restore, investigate the actual incident with sufficient preceding and subsequent evidence, confirm the carrier profile, validate the Chicago rollover/event boundaries, complete the writing-client compatibility gate, and present the test version for the user's publication review. Any real historical correction must show its precise before/after change and receive the user's approval.
