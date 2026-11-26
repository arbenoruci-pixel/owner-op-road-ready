# Run a leased operator's load through RoadReady

Use the [private operator wallet workflow](LEASE_OPERATOR_WALLET.md) for emailed road credentials and settlement proof originals. A wallet original can be filed before the first load.

Use the connected mailbox and the existing RoadReady project. The carrier's phone session and HOS records are separate from this portal. The operator signs in independently at `/operator`. The administrator keeps the verified operator email, carrier identity and factoring mailbox in the private automation configuration.

## Identify the load

Process an actual message from the authorized inbox. Outlook and Gmail threads can contain multiple tenders, revisions or forwarded sender addresses. Check the envelope, operator assignment, broker and broker load number against the original. A mail subject is a useful way to find a message, but insufficient to assign a stranger's freight. If the operator's identity is ambiguous, ask the carrier privately. Replay overlapping events by immutable provider message ID and the original attachment's SHA256.

Look up the operator by carrier ID and the registered address in `rr_lease_private.operator_invites`. Obtain the assignment UUID from `rr_lease_stage_load(operator_id, broker_name, load_number)`. Do not open the shared carrier web app. Capture the exact attached PDF or photo in a private temporary directory. Read and inspect every required page. Keep the original and any reviewed extracted text associated with that one load.

## Store a private original with the SQL connector

Use the booked operator and load UUIDs. The helper accepts PDF, JPEG, PNG, HEIC/HEIF and WebP up to the schema's 32 MiB limit. Work from a current checkout, in temporary storage with owner-only permissions.

```sh
node scripts/lease-operator/original.mjs "$original_file" "$new_private_directory" "$operator_id" "$load_id" ratecon
```

Execute the generated SQL with the authorized project connector in filename order. Use an orchestration cell to forward SQL file contents without printing them. For large encoded chunk statements, read a file in short byte windows and concatenate in memory before one connector query. Never paste the encoded files into chat. Inspect the init result; resume identical documents by returned ID and verified metadata. Check `is_ready`, length and SHA256 against the local original after the finish call. Only released documents are visible in the portal. If the connector cannot materialize an attachment, keep a pending exception and retain the source email. Never upload a thumbnail or a sharing link as the original.

## Publish the rate confirmation and match the POD

1. Call `rr_lease_apply_mail(document_id, provider_message_id, sender_email, assignment_evidence, fields, previous_ratecon_id, verified_for_billing)`. For the first rate confirmation use a null previous ID; for a revision supply the actual current original. The JSON `fields` is a fully reviewed snapshot. Use `pickup_address`, `delivery_address`, `pickup_number`, `delivery_number`, `pickup_at`, `delivery_at`, `pickup_timezone`, `delivery_timezone`, `reefer_instructions`, `gross_cents` and `steps`. Each step has a `title` and a `detail`. Represent every stop in order, including company, complete copyable address, pickup/PO, appointment or FCFS window with its local timezone, check-in instructions and delivery paperwork. Do not turn a window into an exact appointment. Preserve reefer units, range and continuous/cycle mode exactly as stated. Show missing/conflicting items as needing clarification. Preserve all original revisions.
2. Read the released load and its current original back. Only the correct operator and associated carrier should see the dispatch and documents. The authorized driver may reply by email with his POD; match the actual sender and document against the existing load, broker and delivery stops. Preserve all pages. Accept a billing-ready POD only after confirming final delivery, required receiver signature/stamp, full legible pages and any noted exception. Supersede a mistaken scan using `rr_lease_review_evidence` with supporting evidence and the earlier document identity. A different or corrected rate confirmation after billing requires private review of the existing invoice.
3. For a genuine verified final delivery record the actual delivery date from the POD and receipt of the necessary trip documents. Call `rr_lease_finalize_delivery(load_id, final_pod_id, actual_delivery_date, all_stops_complete, required_docs_submitted_at, receipt_reference)`. Use the earliest verified receipt timestamp, even when paperwork is disputed, as supported by the evidence. This allocates the load once and preserves the service date for a late item in an open draft. Keep the broker's agreed gross; rejected, pending or duplicate accessorial requests do not increase the invoice.

## Invoice and factor

Use the exact invoice party, freight charges, address and terms from the approved sources. The carrier is the biller. The broker owes the full approved gross. Pay allocation, fuel, insurance, ELD and operator banking information stay off the freight invoice. Use the existing Narta invoice's FirstLine Notice of Assignment remittance instruction. Include the current rate con, every required POD and only approved supporting documents. For the packet builder's private manifest use the real load ID, broker, addresses, load number, gross cents, invoice number/date/amount in cents and the immutable document metadata and paths. Preserve original files when rendering photos. Compare the generated page count, original checksums and total.

```sh
node scripts/lease-operator/packet.mjs "$private_manifest" "$private_invoice_pdf"
```

Store and verify the completed packet using document kind `invoice`. Use the load's existing invoice number or allocate one unique number for that load. Search the sending account's Sent folder for this exact invoice before submitting. Call `rr_lease_claim_factoring(load_id, packet_id, invoice_no, amount_cents, ratecon_id, pod_ids, supporting_ids)`. Only the worker receiving `send=true` may send. Use the carrier's authenticated sending mailbox, the returned subject and fixed FirstLine recipient. Use the connector's draft/attachment upload flow if the PDF exceeds its direct attachment limit. Verify that the actual saved draft contains the exact packet and one recipient before sending. A failed upload, a generic success message or an empty draft is not a sent invoice.

Call `rr_lease_finish_factoring(claim_id, 'sent', reference)` only with provider confirmation. For a timeout or uncertain response record `uncertain`; reconcile with Sent Items or a matching FirstLine receipt. Missing mail in a search alone is insufficient to release the send lock. Only a definite documented rejection permits the controlled retry path. A FirstLine acknowledgement establishes receipt; set `funded` only with an actual matching remittance. No duplicate submission to another channel.

## Weekly accounts

The database computes dollar amounts in integer cents using the load's agreed share. Display load count, broker gross, carrier share, operator share, individual expenses, credits, amount due and payment status. Use the signed agreement for the applicable percentage. A driver-paid item is informational; a documented and authorized carrier advance is a deduction. Record actual insurance for the covered unit under the signed cost schedule. Use only established ELD cost, frequency and payer. Do not convert a monthly invoice to four equal weeks by assumption. A weekly charge with an approved schedule can be applied once using `rr_lease_apply_weekly_cost` with the correct period evidence. Record fuel using receipt or fuel-card transaction identity and the actual payer. Do not duplicate advances across pay periods.

Maintain a draft for unresolved items. Review insurance, fuel and ELD separately. Distinguish documented zero, an actual amount and an explicitly deferred item. When due, an unverified potential deduction may be deferred with a reason so earned pay can be released without guessing charges. Set the operator's payday only with the owner's instruction; track the lease's payment deadline from receipt of required trip documents independently of factoring funding. Issue statements for delivered loads with reviewed charges; keep their underlying rate documentation accessible. Mark a statement paid only after verifying a bank payment reference, date and matching amount. Creating a statement never moves money.

### Fuel on Narta's shared Mudflap account

Search Narta's Hotmail for receipts from `support@mudflapinc.com` with a subject starting with `Your Mudflap receipt`. Read the purchase date, `PURCHASED BY`, `Truck #`, `TRANSACTION ID` and `TOTAL CHARGED`. Match Shkumbin by his verified driver identity or by a truck or fuel code confirmed as his for that purchase. The shared account identifies Narta. It cannot identify who fueled. Leave unmatched purchases unassigned. If the driver and truck conflict, ask Arben privately before applying a charge.

Keep the original receipt privately with its email message ID. Verify the actual payer and the final charge after discounts. For a documented advance paid by Narta under the lease, enter the final amount once as a fuel deduction for the purchase week. Record a purchase paid by Shkumbin as a driver-paid expense with zero settlement effect. Use `mudflap:<TRANSACTION ID>` as the fuel evidence reference and check it across all weeks before posting. A matching TA/Petro receipt or repeated email supports the same purchase. For a verified correction or refund, retain the original, link the adjustment to its transaction ID and record the difference once using the correction or refund reference. Keep issued statements intact.
