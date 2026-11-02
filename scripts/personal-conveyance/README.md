# Explicit personal conveyance — draft

Recorded-event edits previously rejected `specialMode`, and the recorded OFF
editor had no Personal Conveyance control. An OFF note could therefore describe
personal travel while its category remained `none`. Inserts also omitted the
category. The live workflow derived it from unrestricted reason text.

The installer adds an explicit OFF/PC choice, retains its explanation, passes the
category through the existing audited edit transaction, and sets it on inserted
events. Changing to a working status clears PC. Live selection uses the exact
activity and OFF status. No equipment, drop, mileage, destination or free-text
heuristic reclassifies a trip. No stored log is migrated or automatically signed.

PC is an off-duty category, subject to the actual purpose of the trip. The UI
includes the FMCSA distinction between qualifying personal travel and returning
home/terminal from a dispatched delivery. References:

- https://www.fmcsa.dot.gov/regulations/hours-service/personal-conveyance
- https://www.fmcsa.dot.gov/regulations/hours-service/personal-conveyance-frequently-asked-questions-0

## Validation and merge blockers

Nine focused tests passed on a diagnostically materialized runtime: explicit
selection, invalid status rejection, OFF metadata correction, before/after edit
history, stale-edit conflicts, unchanged adjacent events and mileage,
recertification, same-day export/import and reload, insert, React rendering and
compilation. The existing 30 unified-duty regressions also passed.

The untouched `fedd811` production build failed first in
`scripts/test-angled-reader-v110339.mjs` (`find tilted paper at -75`). A diagnostic
continuation also failed at the source-copy installer, followed by missing or
mismatched later materialization prerequisites. These failures predate this
change. Full production compilation, browser interaction and device sync have
not been verified. No production deployment or database write was made.

Before merging: restore the clean production build, run this final installer and
the focused tests on that exact runtime, refresh the reviewed duty compatibility
hashes for the intentional editor/core changes, test save/reopen on a device, and
stamp a new release through the existing release process. Keep existing build
assertions intact. This draft intentionally does not bump the production version.

```sh
node --test scripts/personal-conveyance/mode.test.mjs
# After successful production materialization:
node scripts/personal-conveyance/install.mjs
node --test scripts/personal-conveyance/*.test.mjs
node scripts/v110378/test-duty-forms.mjs
```

Fixtures are synthetic. User logs, signatures, identifiers and attachments must
remain outside this public repository.
