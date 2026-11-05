# Signed inspection logbook

DOT preparation shows one daily-log viewer with eight date tabs. Historical dates use the exact `signatureByDay[day].certifiedContent`, signature, signed equipment/profile and miles. The current date uses the recorded log through the latest On Duty DOT Inspection entry; the entry itself remains visible at that boundary with zero invented duration. Without a recorded DOT entry, the cutoff is the current terminal minute.

Preparing a share reads the active device's signed evidence and the account revision required by the existing atomic server transaction. It never calls `syncAccount`, selects conflict versions, updates the editable archive, or compares backup payloads. Device ownership, account changes, pending device receive, missing signatures, revision/archive races and changes during upload remain guarded. The existing server creates eight immutable files and the capability link; no database migration is required.

The new installer runs after the existing background-sync release. Existing historical installers/tests remain intact. New regression commands after materialization:

```sh
node --test scripts/inspection-signed/core.test.mjs scripts/inspection-signed/client.test.mjs scripts/inspection-signed/rendered.test.mjs
node scripts/verify-module-boundaries.mjs
```

Validation: eight targeted tests and module boundaries passed on November 4, 2026. Tests cover signed evidence after draft edits, exact DOT cutoff, stale saved copies, no account writes, ownership/receive/signature failures, upload revocation, and actual React rendering without conflict choices. Full production build remains blocked before this installer by the existing `finalize-ratecon-one-way-v11029.mjs` registry anchor. Diagnostic continuation also encountered the existing angled-reader regression and legacy materialization/lock anchors. Targeted tests used the existing report projection and renderer prerequisites; this is not a successful complete production build or browser E2E run.

Automatic Vercel deployment is disabled only for this draft branch to avoid starting a billable preview while the baseline build is unresolved. Main and other branches retain their settings. Remove the branch-only rule when the draft is ready for a validated deployment.
