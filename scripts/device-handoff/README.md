# Same-device sign-in recovery

An interrupted incoming transfer records its generation in IndexedDB. Signing
in again on that device advances the server generation, but the server does not
request a new transfer because the device has not changed. Previously the local
pending transfer kept its old generation and acknowledgement returned
`active: false`, leaving `Opening your logbook` blocked indefinitely.

After the existing server/session checks succeed, advance only an unfinished
handoff belonging to that same account to the verified generation. Preserve its
record/archive completion flags. Completed transfers, other accounts and revoked
devices are unchanged; the acknowledgement endpoint still requires the exact
current device, session and generation. No database migration is needed.

Regression coverage in `scripts/device-reconnect/reconnect.test.mjs` includes
the old-generation failure, partial archive continuation, completed transfers,
new-device transfers, different accounts, revocation and failed local persistence.
The source and runtime DOT locks retain all unrelated hashes.

Release 110.4.112 is based on production 110.4.110. The pending local-originals
PR is excluded. Preview deployment is disabled for this branch; release through
the normal production Git merge after checks pass.
