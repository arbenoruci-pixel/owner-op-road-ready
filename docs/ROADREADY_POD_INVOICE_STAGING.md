# Staging the driver POD and invoice flow

The preview at `/operator/design-review?test=pod-invoice` runs a fictional two-delivery load in the browser. The signed-in carrier queue at `/operator?podInvoice=<load UUID>` reads the database for the authenticated carrier. FirstLine is simulated in the exercise.

## Enable an isolated staging backend

1. Bind the preview's operator Supabase settings to a separate, empty staging project or branch and verify its project reference. Apply the operator migrations in order, including `20261127012000_pod_invoice_workflow.sql` and `20261127080000_rr_pod_staging_mail_transport.sql`. Create the staging carrier, its assigned test driver, and synthetic load. Use an approved final rate in cents.
2. Register the staging callback `https://<staging-ref>.supabase.co/functions/v1/rr-pod-notice/callback` in the approved Microsoft confidential app. Configure `RR_OPERATOR_MAIL_CLIENT_SECRET`, `RR_POD_STAGING_PROJECT_REF`, `RR_POD_STAGING_CARRIER_ID`, and `RR_POD_STAGING_PORTAL_URL` in the staging function environment. Use the HTTPS operator URL with the path `/operator`. The Edge Function checks its own project URL before accepting a request.
3. Initialize the staging operator mail sender with sender and pilot both set to `nartaexpress@hotmail.com`. Deploy only `rr-pod-notice` with JWT verification disabled for this function. Its worker verifies one-use database tickets. The separate consent route uses Microsoft sign-in. Visit the function's `/connect` route and authorize the Narta Hotmail account.
4. Enroll only the staged carrier UUID in `rr_lease_private.pod_workflow_carriers`. Set the single `rr_lease_private.pod_staging_mail_transport` row to the staging project reference. Verify that pg_net and pg_cron are available and that `rr-pod-staging-mail` is scheduled. The default is disabled.
5. Sign in as the test driver, submit an original twice, and check the office queue with the carrier account. Confirm one original, one notification reference, and one draft. Only the verified full rate is used for the broker draft. Verify both delivery stops in the office before marking the draft ready. Match the notification reference in the Narta Inbox. A Graph acceptance records provider acceptance. The Inbox provides confirmation of receipt.

Use `node --test scripts/lease-operator/*.test.mjs` for portal and worker tests. Run `scripts/lease-operator/pod-invoice-workflow.test.sql` only against a disposable migrated PostgreSQL database with the expected Supabase roles. The regression covers retries, stop evidence, corrections, unauthorized users, and the historical factoring record.

Removing the staging transport row stops new mail wake-ups. Reconcile any in-flight send against the Outlook notification reference before resending. A real deployment requires its own explicit rollout decision.
