# Document reading and filing — 110.4.11 / Reader 0.3.36

The supplied review was from a native two-page Load Confirmation. Its readable
heading was ignored because the core required an unnumbered pickup/delivery and
`Total Rate` rather than the actual numbered stops and `Total USD` pay table.
The old page classifier then treated delivery/POD requirements in the terms as
a delivery document. The core returned two unknown documents and the filing
adapter cleared their shipping fields as a mixed packet.

This release recognizes that complete table structure, extracts exact source
references, rate, equipment, miles and dated stop rows, and joins terms pages
only when their explicit load and sequential page-count footers agree. A new
primary document, conflicting reference, weak footer or broken pagination stays
separate. Pickup/delivery cities from the explicit native stop table reach the saved load;
company proposals remain separate from route locations. Broker/carrier names
are offered with source evidence for confirmation. Full-year context comes from the document; no current-year guess is
used. Table party/address proposals still require source confirmation. Original
text, offsets and files remain unchanged; automatic acceptance stays disabled.

The filing form previously matched a folder before the source Reader completed.
It now refreshes suggestions from supported source references, including valid
secondary OCR observations. Explicit folder choices and Choose later remain
unchanged. The supported document date replaces an automatic delivery-date
fallback, while a manually edited date remains unchanged. The original save
confirmation and load-identity checks remain in place.

Home now reads the current load's verified document summary directly from the
existing business store, including a load projected from a recorded pickup with
no RateCon guide. A verified POD covers its BOL requirement even when it is not
linked to a duty event. Another load's documents and unverified/archived records
cannot clear the warning.

## Verification

- 380 core tests, including numbered-table recognition, source quotes, negative
  signals, footer conflicts, weak recognition and explicit year context.
- Six materialized filing tests: source reference rematch, secondary OCR,
  manual choices, ambiguity, full scanner classification and document coverage.
- Chromium and WebKit flows in the Owned reader workflow: synthetic POD intake,
  manual folder/date changes, source confirmation, save/reload and Home coverage;
  real native two-page PDF intake, exact type/load/date, export and save/reload.
- Existing architecture, runtime locks and all repository workflow gates remain.
- Only synthetic fixtures are committed. Customer reports/photos are not changed
  or committed. No customer-account or physical-device writes are performed.

## Small real-device check

After the update shows 110.4.11, reopen the original two-page PDF in the phone or
iPad file picker. Confirm one Rate Confirmation, its printed load number, date,
rate and both pages before saving. Re-read the original BOL/POD, check the
suggested folder against its reference, optionally change the folder/date and
confirm a source field; those manual choices must remain. Save, reload, open the
load's Documents folder and the original. A verified saved POD on the current
load should remove Home's missing-BOL warning without linking to the logbook.

Existing snapshots do not re-read themselves. Broker load numbers and shipping
BOL numbers remain distinct identifiers; this change does not silently merge
existing load folders or rewrite duty history.
