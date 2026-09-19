# Shared duty controls and recorded shipment identity — 110.3.78

The driver reports contradictory shipment rows and inconsistent activity forms between Edit and Change Status. A supplied day export contains one pickup whose original description disagrees with its structured load/destination; the same trailer has a later recorded handoff. That private export and its signature/GPS are not included in this repository. All new tests are synthetic.

## Runtime changes

- One shared component implementation renders duty status, activities, location and notes for the recorded editor and live status workflow. Insert uses the same fields. Existing time/graph/edit conflict controllers remain separate for recorded edits versus live changes.
- Trailer pickup/drop activities are recognized from existing notes even when older records have an empty reasons array. New status rows persist their selected reasons. Unrelated activities no longer inherit NO TRAILER or stale drop/hook values.
- Current status uses current physical location; historical Edit keeps the recorded event location. Current GPS for a past event requires an explicit user action and confirmation.
- A selected guide cannot overwrite a recorded pickup identity. Reference checks do not treat secondary BOL/PO as interchangeable load identifiers. Original recorded/manual routes are not deleted by guide reconciliation.
- Exact unambiguous existing manual pickup plans can be reused. Ambiguous or spelling-conflicting rows are presented for review rather than silently merged.
- Suspect guide-only place headings are marked for review and excluded from active route display.

## Existing data correction

The Form offers a read-only conflict explanation. Confirmation requires a unique same-day manual plan, actual pickup, and same-trailer later handoff, with no intervening pickup. The driver verifies the reference/destination and explicitly confirms the two rows describe one move. A stale snapshot, ambiguous identifiers, removed records or invalid place prevents saving.

The duplicate plan becomes superseded; its original history is retained. The canonical route records a trailer handoff, not freight paperwork acceptance or payment. Secondary identifiers, all duty minutes, recorded GPS, signatures, documents, mileage and other days are preserved. Existing certification reconciliation decides whether the changed metadata requires recertification. No customer database is changed by deploying this patch.

## Verification

Local checks against the previously materialized 110.3.77 runtime: 15 focused cases, continuous graph contracts, locked module hashes and JSX syntax. Full materialization/production build and mobile Chromium/WebKit tests are required on the exact candidate commit before publication. New compiled-browser coverage includes explicit review, immutable prior history, reload, common controls, historical versus current location, small-screen overflow, activity persistence and prevention of phantom trailer drops.
