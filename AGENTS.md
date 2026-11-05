# Agreed changes only

Arben Oruci confirmed that the DOT workflow works in release **110.4.100** and requested a lock on November 4, 2026 (America/New_York): "tash bone lock qe mos me ma ndryshu naj qka pa u marr vesh".

- Preserve the working application's design and behavior. Keep every task within the scope explicitly agreed with Arben; do not add unsolicited redesigns, workflow changes, data migrations, or refactors.
- Before changing the protected DOT workflow, explain the concrete proposed change and obtain Arben's explicit approval for that scope. A bug report permits investigation; it does not authorize replacing the workflow. Approval already given for a concrete change remains valid; do not ask again for the same work.
- The protected contract covers the three-step wizard, its controls and styling, signed historical logs, today's recorded DOT cutoff, current-phone Digital Wallet originals, the officer package, its review checkbox, and email/link handoff.
- Read [the lock contract](docs/DOT_WORKFLOW_LOCK.md) before touching these areas. Record any later approval there and update only the corresponding hash entries after the agreed change and regression checks. Never regenerate the whole baseline, delete a check, loosen a test, or bypass the lock merely to make a build pass.
- Preparing or sending an inspection copy must not edit driver records, rewrite a signed day, choose an account copy over the phone, or create a signature. Any record restoration requires separate, specific authorization.
- Read-only investigation and tests may proceed. Work outside the protected area may proceed within its own agreed scope while all DOT lock checks continue to pass.

The current request authorizes adding this development lock and its verification. It authorizes no changes to the working UI, log contents, signatures, wallet files, or delivery behavior.
