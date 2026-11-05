# Signed inspection logbook

DOT preparation shows one daily-log viewer with eight date tabs. Historical dates use the exact `signatureByDay[day].certifiedContent`, signature, signed equipment/profile and miles. The current date uses the recorded log through the latest On Duty DOT Inspection entry; the entry itself remains visible at that boundary with zero invented duration. Without a recorded DOT entry, the cutoff is the current terminal minute.

Preparing a share reads the active device's signed evidence and the account revision required by the existing atomic server transaction. It never calls `syncAccount`, selects conflict versions, updates the editable archive, or compares backup payloads. Device ownership, account changes, pending device receive, missing signatures, revision/archive races and changes during upload remain guarded. The existing server creates eight immutable files and the capability link; no database migration is required.

The new installer runs after the existing background-sync release. Existing historical installers/tests remain intact. New regression commands after materialization:

```sh
node --test scripts/inspection-signed/core.test.mjs scripts/inspection-signed/client.test.mjs scripts/inspection-signed/rendered.test.mjs
node scripts/verify-module-boundaries.mjs
```

Validation on November 5, 2026: the complete materialization sequence passed from a fresh checkout with `READER_OFFLINE_BUILD=1`, including all eight signed-inspection regressions. The optimized Next.js production build, module-boundary verification and all 11 runtime file locks passed. The initial checkout's historical anchor failures did not reproduce in the clean checkout; no legacy assertions or installers were weakened. Next.js was compiled with a physical node_modules directory because Turbopack rejects a symlink outside the project root.

Tests cover signed evidence after draft edits, exact DOT cutoff, stale saved copies, no account writes, ownership/receive/signature failures, upload revocation, and actual React rendering without conflict choices. Live backend requests were disabled during local verification. Browser interaction remains unverified locally because the cloud browser cannot reach the local server and a local browser executable is unavailable. No production log records were read or modified.

Automatic Vercel preview deployment is disabled only for this feature branch. The validated change can use the existing main-branch production deployment without creating an additional preview. Main and other branches retain their settings.
