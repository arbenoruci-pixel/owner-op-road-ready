# Staging the driver POD and invoice flow

The preview at `/operator/design-review?test=pod-invoice` runs a fictional two-delivery load in the browser. The signed-in carrier queue at `/operator?podInvoice=<load UUID>` reads the database for the authenticated carrier. FirstLine is simulated in the exercise.

## Enable an isolated staging backend

1. Bind the preview's operator Supabase settings to a separate, empty staging project or branch and verify its project reference. For a partial historical replay, follow [the disposable database recovery](#recover-the-disposable-database-after-the-historical-rls-migration-stops). Apply the operator migrations in order, including `20261127012000_pod_invoice_workflow.sql` and `20261127080000_rr_pod_staging_mail_transport.sql`. Create the staging carrier, its assigned test driver, and synthetic load. Use an approved final rate in cents.
2. Register the staging callback `https://<staging-ref>.supabase.co/functions/v1/rr-pod-notice/callback` in the approved Microsoft confidential app. Configure `RR_OPERATOR_MAIL_CLIENT_SECRET`, `RR_POD_STAGING_PROJECT_REF`, `RR_POD_STAGING_CARRIER_ID`, and `RR_POD_STAGING_PORTAL_URL` in the staging function environment. Use the HTTPS operator URL with the path `/operator`. The Edge Function checks its own project URL before accepting a request.
3. Initialize the staging operator mail sender with sender and pilot both set to `nartaexpress@hotmail.com`. Deploy only `rr-pod-notice` with JWT verification disabled for this function. Its worker verifies one-use database tickets. The separate consent route uses Microsoft sign-in. Visit the function's `/connect` route and authorize the Narta Hotmail account.
4. Enroll only the staged carrier UUID in `rr_lease_private.pod_workflow_carriers`. Set the single `rr_lease_private.pod_staging_mail_transport` row to the staging project reference. Verify that pg_net and pg_cron are available and that `rr-pod-staging-mail` is scheduled. The default is disabled.
5. Sign in as the test driver, submit an original twice, and check the office queue with the carrier account. Confirm one original, one notification reference, and one draft. Only the verified full rate is used for the broker draft. Verify both delivery stops in the office before marking the draft ready. Match the notification reference in the Narta Inbox. A Graph acceptance records provider acceptance. The Inbox provides confirmation of receipt.

Use `node --test scripts/lease-operator/*.test.mjs` for portal and worker tests. Run `scripts/lease-operator/pod-invoice-workflow.test.sql` only against a disposable migrated PostgreSQL database with the expected Supabase roles. The regression covers retries, stop evidence, corrections, unauthorized users, and the historical factoring record.

Removing the staging transport row stops new mail wake-ups. Reconcile any in-flight send against the Outlook notification reference before resending. A real deployment requires its own explicit rollout decision.

## Recover the disposable database after the historical RLS migration stops

On the November 26 preview, hosted versions `20260906154009` and `20260906154101` had completed. Version `20260906154331` then tried to revoke privileges on an event trigger function that the preview had not inherited. The hosted history and the Git migrations are different. The repair below installs the POD stack in the disposable database and records it as a separate staging migration. The hosted branch can continue to display `MIGRATIONS_FAILED` for the earlier provisioning attempt.

1. Verify the destination against the parent's branch list. Require the selected preview to be non-default, and use its own project reference for every write. Inspect its migration history and require both existing foundation versions, the two confirmed synthetic office and driver identities, and absence of `rr_lease_private` and `public.rr_lease_loads`. Put these checks in the transaction before creating anything. If the operator schema already exists, verify it before attempting any further bootstrap.
2. Read the parent's schema definition for the exact zero-argument function and its event trigger. Review the returned SQL and verify that it enables RLS on new public tables. Capture only the function and event trigger metadata. The November preview used the following read-only catalog query on the parent.

   ```sql
   SELECT pg_get_functiondef(p.oid), e.evtname, e.evtevent, e.evttags, e.evtenabled
   FROM pg_proc AS p
   JOIN pg_event_trigger AS e ON e.evtfoid = p.oid
   WHERE p.oid = to_regprocedure('public.rls_auto_enable()');
   ```

3. On the preview, assemble a single transaction. Install `pg_cron` and verify `pg_net`, `pgcrypto` and Vault are present. Restore the reviewed function. Revoke `EXECUTE` on its exact signature from `PUBLIC`, `anon` and `authenticated`. Restore the enabled `rls_auto_enable` event trigger on `ddl_command_end` for `CREATE TABLE`, `CREATE TABLE AS` and `SELECT INTO` before creating the operator tables.
4. Append the following files from `supabase/migrations/` at commit `80cf9628d713781d02dd4d75828061e380b7d86b`, in the order shown. Remove only file-level transaction wrappers when combining them into the outer transaction. This allowlist excludes the assignment-alert and rate-con pilot mail hooks, both of which contain production destinations.

   ```text
   20261126073000_leased_operator_workspace.sql
   20261126111000_lease_mail_workflow.sql
   20261126120000_lease_operator_wallet.sql
   20261126130000_lease_carrier_workspace.sql
   20261126143000_lease_intake_review.sql
   20261126153849_rr_phase1_financial_ledger_security_foundation.sql
   20261126153937_rr_phase1_ledger_backfill_and_authoritative_settlement.sql
   20261126154155_rr_phase1_financial_source_integrity_and_receipt_proof.sql
   20261126154238_rr_phase1_projection_and_carryover_guards.sql
   20261126161056_rr_phase1_audit_remediation_phone_pod_invoice_gross_no_truncate.sql
   20261126173000_rr_phase1_step2a_driver_pod_replacement.sql
   20261126184000_rr_phase1_step2b_atomic_intake.sql
   20261126195000_rr_phase1_step2c_report_archive.sql
   20261126195500_rr_phase1_step2c_mail_and_assignment.sql
   20261126200000_rr_phase1_step3_financial_bridge.sql
   20261126220700_operator_mail_sender.sql
   20261127012000_pod_invoice_workflow.sql
   20261127080000_rr_pod_staging_mail_transport.sql
   ```

5. Before committing, assert that the event trigger is enabled and neither application role can execute its function. Require RLS on every public `rr_lease_` table (16 at this revision), presence of `rr_lease_private.pod_invoice_drafts` and `rr_lease_private.pod_mail_outbox`, and exactly one active `rr-pod-staging-mail` cron entry. Keep the `rr_lease_private.pod_staging_mail_transport` table empty during rehearsal. Run once ending in `ROLLBACK`, then verify the initial schema and both test accounts remain. Apply the same verified batch as the staging migration `rr_isolated_pod_preview_bootstrap`, reload the PostgREST schema cache, and repeat the checks against the committed schema. Preserve the hosted migration history.
6. Complete the signed-in test and Microsoft stages above. Verify the reopened POD bytes against the original, one draft for the verified rate, one notification reference after a duplicate upload, and the matching message in the Narta Inbox. A pending outbox row is evidence of queueing only.
