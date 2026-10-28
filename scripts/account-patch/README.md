# Bounded account patch

The production timeout stack pointed at the complete-workspace diff in
`commit_account`, called after `patch_account` had already received the exact
changed keys. Device verification waited on that transaction's advisory lock,
and inspection sharing consequently refused to create a current link.

The migration computes the immutable delta only from explicit changed/deleted
keys. It retains the owner approval, synchronization setting, size limit,
optimistic revision, transaction lock and existing active-device trigger. No
saved records, policies, grants, timeout settings or inspection checks change.

`baseline.sql` is the reviewed previous implementation, used only in the
isolated test database. Tests compare actual Postgres results, immutable
history and no-op behavior; they also exercise authorization rollback,
optimistic conflicts, size limits and a synthetic archive with 1,505 records.

Run with an isolated PGlite dependency (not a production dependency):

```sh
npm install --prefix /tmp/road-ready-pg-test --no-audit --no-fund @electric-sql/pglite@0.3.14
ROAD_READY_PGLITE_MODULE=/tmp/road-ready-pg-test/node_modules/@electric-sql/pglite/dist/index.js node --test scripts/account-patch/database.test.mjs
```

Read-only query-plan comparison on the existing archive: complete comparison
1,357 ms; one-key comparison 156 ms. These measurements cover comparison work,
not network latency or the full transaction. Verify the actual authenticated
client's next synchronization after applying the migration.
