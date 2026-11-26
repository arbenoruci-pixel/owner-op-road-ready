# File a driver's road documents

Use the private operator workspace for the driver named on the original or assigned to the unit on the document date. An address on an email alone does not identify the driver. For a carrier or equipment document that could belong to multiple people, retain the attachment in the mailbox until dispatch confirms its intended wallet. Use the private operator UUID, including the owner's separate operator record for his own documents.

When the carrier confirms a required road document for this driver or assigned unit, record the stable slot, display title, whether an expiry date must be verified, and the requirement source using `rr_lease_wallet_require(p_operator_id,p_slot_key,p_title,p_expiry_required,p_active,p_evidence_reference)`. Set active to true for a current requirement. Retire a slot only with evidence that it has stopped applying. The driver sees an unfilled active slot as missing, an expired original with its date, and a required but unverified expiry separately. Document completeness depends on the carrier's verified list.

Read the actual attachment, verify its identity and dates, and preserve the original bytes. A `registration`, `insurance`, `permit`, `inspection`, `license`, `medical`, `lease`, `eld`, `carrier_document` or `other` record appears in Digital Wallet for that driver. Use a stable slot per credential, unit and jurisdiction (for example `registration:unit17:il`). Record expiry and issue dates only when evidenced; omit either when unknown. To replace a document, inspect its current original and supply that exact UUID as `replaces`. Retain earlier versions. A stale renewal must never deactivate a newer original.

For settlement proofs, use `fuel_receipt` or `expense_receipt` with one stable slot per transaction (for example `mudflap:<normalized-transaction-id>`), its real purchase date as `issued_on` and the full immutable original. Omit `expires_on`. These receipts are available through linked statement entries. Use a separate slot for a documented refund and link the credit to its original transaction. A policy that is also carried on the truck may use the road document category `insurance`. Attach the verified original's UUID in `rr_lease_adjustments.wallet_document_id` or the corresponding owner expense, as appropriate. A source document and an actual authorized deduction are separate records.

Prepare a private JSON manifest. Include `operator_id`, `slot_key`, `category`, `title`, the original `file_name`, `source_ref` (provider, mailbox, immutable message and attachment/part identifiers) and `assignment_evidence` (the basis for attributing the document). Optional fields are `issued_on`, `expires_on` and `replaces`. Keep personal credentials, financial references and attachments out of public links and chat output.

```sh
node scripts/lease-operator/wallet.mjs "$original_file" "$new_private_directory" "$manifest"
```

Run the generated SQL statements in order through the authorized project's SQL connector. For a retry the same attachment, target and content return the same UUID. Source collisions or conflicting files require review. The final step checks the exact byte count and SHA256 before publishing the selected version. Read its final ID, checksum, size, revision and `is_ready`; an earlier verified file may have `is_current=false` when replayed. Drivers view or download their own files in the portal. A driver who needs a document before losing signal can download the original to Files.

### Receipt delivered in the email body

For a Mudflap receipt without an attachment, capture the full directly received message from Narta's Hotmail, including its Graph message ID, internet message ID when available, sender, recipients, subject, received timestamp and complete `body.content` with `body.contentType`. A body preview, a forwarded copy or an extracted total cannot stand in for this evidence. Verify the purchase/driver and amount exactly as for an attached receipt. For a forwarded copy, locate the directly received vendor message or independently verify the original vendor attachment before filing.

Pass the provider message JSON plus the same wallet metadata and `mailbox` in the private manifest. The helper derives the source reference and filename. The portal labels this an **Email receipt**, renders the body as plain text and offers the stored JSON record. Original markup and whitespace are preserved in that record.

```sh
node scripts/lease-operator/wallet.mjs "$outlook_message_json" "$new_private_directory" "$manifest" --outlook-receipt
```
