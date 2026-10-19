# Scoped audit evidence preparation

This isolated candidate adds separate **IFTA, Safety and IRP** views to the existing Documents workspace. The installer creates no cloud schema and changes no source originals, log events, Motive settings, permissions or subscriptions. Apply it only to a restored test candidate before the user reviews the version for publication.

## Install

Run the installer with the fully materialized app candidate as its working directory, after the workspace-navigation finalizer:

```sh
node /workspace/scratch/e06b4e0f08ac/road-ready/scripts/reliability-audit/install.mjs
```

The script checks each integration anchor and is repeatable. It copies four runtime templates into `source/src/modules/owneros`, adds the Audit tab to `EvidenceWorkspaceV110453.jsx`, preserves two explicit audit fields in the business normalizer, and adds an optional audit index to the existing ZIP exporter. Existing non-audit packets retain their original behavior.

## Behavior and data decisions

- Seventeen preparation checks distinguish weekly operations, quarterly filings, license years, annual reviews, registration reporting periods and expiring credentials.
- Company, operation, base jurisdictions, fleet and CDL/Part 382 applicability start unconfirmed. A reviewer records the actual source reference and effective date. This implementation does not infer the live company's bases from its address, home-terminal time zone or prior conversations.
- A weekly vehicle/driver check retains its week, unit, driver and optional load scope. Company-wide and quarterly checks retain their broader scope. Selecting another week or unit cannot reuse an unrelated weekly check. A week spanning two quarters exposes both quarterly filing checks.
- **Evidence checked** requires an explicit content review, coverage dates, reviewer, linked originals and verified SHA-256 values. Merely finding a file does not satisfy a check. Changed bytes or filing scope require review again; sync bookkeeping timestamps alone do not invalidate an unchanged source. Legacy originals without persistent hashes require another byte check after reopening.
- Not-applicable findings require a reason and bounded coverage. Confirmed inactive requirements do not appear as missing documents. Expiring credentials remain selectable even when issued before the selected week, but expired or partially covered periods cannot appear checked.
- Reviews and profile changes retain prior history. The metadata lives in `auditEvidenceProfileV1` and stable-ID `auditEvidenceReviewsV1` business records, which the existing backup/account-record transport carries. No original bytes or copied log history are inserted in this sidecar.
- Add actions carry the intended category, unit and applicable weekly load number into the existing filing form. The document date is not fabricated from the selected week or upload time.
- Export includes only explicitly linked sources. The existing ZIP exporter deduplicates originals, while `Audit-readiness.json` identifies applicability, periods, entity scope, review history, source citations, retention notes and unresolved items. A missing or changed archive original downgrades its exported finding without overwriting the saved review.

## Rule coverage and limits

The source registry and rule-set identifier are in `core.js` (`2026-10-19.1`). It cites the official 2026 IFTA manuals, current eCFR provisions, New Jersey MVC IRP guidance and the Illinois 2026 IRP manual. Base-specific IRP preparation currently supports NJ and IL; another confirmed IRP base remains unconfirmed for source review. Common IFTA checks need confirmation against the actual base rules, including local filing adjustments, exemptions and holds. This candidate does not establish the live company's jurisdictions or exemptions.

The weekly screens are in-app preparation checks, not scheduled automations. They record manual content confirmations against originals and do not replace a regulator's audit, prove legal compliance automatically or dismiss HOS violations. Files for distance, filings, qualifications or program evidence must contain the required underlying records; a static attachment does not substitute for required raw tracking data. The existing access model remains unchanged.

## Isolated preview adapters

The component accepts optional `readStore`, `writeStore`, `readOriginal` and `viewStorageKey` props so the same UI can run with synthetic data. Supply both store adapters or neither:

```jsx
<AuditReadiness
  rows={syntheticRows}
  state={syntheticState}
  readStore={readSampleSnapshot}
  writeStore={commitSampleSnapshot}
  readOriginal={readSampleBlob}
  viewStorageKey="road-ready-reliability-preview-audit-view"
  onOpen={openSampleOriginal}
  onAdd={addSampleEvidence}
/>
```

`readStore()` synchronously returns a business-object snapshot. `writeStore(next, expected)` may be asynchronous; it must compare the current sample value with `expected` and throw if the sample changed before replacement. Keep callback identities stable. `readOriginal(row)` returns a Blob or null and may be asynchronous. Paired store adapters bypass real account storage, account storage events and the real account's volatile-storage flag. A separate view key prevents preview navigation from changing the real audit tab's preference. Browser-only preferences restore after mount to avoid an SSR hydration mismatch.

## Verification

Run from the source repository:

```sh
node scripts/reliability-audit/core.test.mjs
ROAD_READY_AUDIT_BASE=/tmp/road-ready-clean-runtime node scripts/reliability-audit/integration.test.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/road-ready-test-browsers ROAD_READY_AUDIT_BASE=/tmp/road-ready-clean-runtime node scripts/reliability-audit/browser.test.mjs --browser=chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/road-ready-test-browsers PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 ROAD_READY_AUDIT_BASE=/tmp/road-ready-clean-runtime node scripts/reliability-audit/browser.test.mjs --browser=webkit
```

`ROAD_READY_AUDIT_BASE` is optional for the integration/browser fixture. When set, it must point to a fully materialized read-only baseline. The tests make and remove their own temporary candidate copies; they do not write that baseline or the parent's review runtime. Browser requests are fulfilled entirely from synthetic local fixtures at an intercepted loopback origin. The browser is a fresh context without a signed-in account, and all other requests are blocked.

Verified: **26 core tests, 6 integration tests and the actual Chromium and WebKit UI flows**. Both browser runs cover unconfirmed applicability, profile confirmation, original inspection, save, reopen, history, week separation, ZIP byte equality and index, an older valid credential, expiration during the selected week, exact Add category/unit/load, protected sample duty records and zero horizontal overflow at 320, 390 and 820 pixels. The integration suite verifies malformed storage and quota failure preserve records, adapter persistence cannot access real account storage, and existing non-audit packets remain unchanged. Source hashes and ZIP bytes use synthetic byte fixtures; this suite does not claim to test PDF rendering or the Reader's extraction accuracy.

Phone/tablet screenshots are generated in `/tmp/road-ready-audit-browser-results`. WebKit ran with verified local browser libraries rather than system-installed packages; the environment flag skips only package-presence preflight. Engine/viewport tests do not establish operation on a physical iPhone or iPad with its actual storage limits and file chooser. Full integrated Reader import, live cross-device synchronization and final production restore/publish gates remain with the parent task.

### Targeted synchronization gate regressions

The read-only review of the parent-owned synchronization candidate identified three concrete issues: repeated offline initial attempts after saves/wake events, a verified records handoff waiting for the full archive before opening the logbook, and old radio choices persisting when conflict versions changed. The parent fixed these in its canonical synchronization templates.

`gate-browser.test.mjs` then verified the actual `AccountSyncGate`, scheduler and status reducer with synthetic sync outcomes in both Chromium and WebKit. All three cases pass in both engines: verified working records open before a failing archive; an unsuccessful records handoff stays blocked; and new conflict versions clear selections and disable confirmation until a fresh choice. Protected synthetic duty records remain unchanged, and the conflict UI has no horizontal overflow at 320, 390 or 820 pixels. The parent scheduler's 10 tests also pass; the original offline reproduction now makes one call after five save/wake cycles and leaves pending versions unacknowledged.

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/road-ready-test-browsers node scripts/reliability-audit/gate-browser.test.mjs --browser=chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/road-ready-test-browsers PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 node scripts/reliability-audit/gate-browser.test.mjs --browser=webkit
```

The Gate fixture intentionally stubs transport and does not model device authorization. The existing policy requires an online active-device check when reopening; that prerequisite remains an explicitly reported limitation because changing access policy was excluded from this task. No authentication or device-session file was edited by this work.

## Owned files

| File | Purpose |
| --- | --- |
| `core.js` | Pure scope, applicability, evidence, cadence and exported-index model |
| `storage.js` | Source hashing, comparison before save and metadata persistence |
| `AuditReadiness.jsx` / `audit.css` | Separate preparation views and review forms |
| `install.mjs` | Guarded, repeatable integration into the generated candidate |
| `core.test.mjs` | Scope, completeness, history and account-record round-trip cases |
| `integration.test.mjs` | Actual installer, storage, source and ZIP module verification |
| `testFixture.mjs` | Isolated temporary materialized fixture |
| `browser.test.mjs` | Actual component flow and mobile/tablet checks in both engines |
| `gate-browser.test.mjs` | Actual sync gate regressions in Chromium and WebKit with synthetic outcomes |

