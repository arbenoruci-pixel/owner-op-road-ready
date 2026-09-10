# Checklist completion from existing work

Full mission previously inferred only pickup presence and BOL capture. Home used a different completion function. Both compared event references against a small set of guide numbers, so an event recorded under the shipper's BOL could fail to match the broker's load. Full mission also saved inferred pickup completion as manual flags during rendering.

Release 110.3.21 routes both views through `resolveChecklistEvidenceV110321`. It projects completion from the current Logbook and reviewed Vault metadata. It never writes events, timestamps, certifications, signatures or inferred manual flags.

| Step | Evidence |
| --- | --- |
| Pre-trip | Closed ON row with PTI / pre-trip activity and a matching load reference; a closed unnumbered PTI immediately preceding that load's work can also qualify. |
| Pickup / delivery arrival | Matching ON activity at the corresponding stop. Combined activities are read independently. |
| Route | Recorded arrival at that stop; a signed receiver document can establish that its delivery route was reached. |
| Departure | Driving after the corresponding closed arrival and before arrival at the following stop. |
| BOL | Current, assigned BOL metadata for this load. |
| Receiver paperwork / POD | Confirmed signed delivery document for the correct freight stop. Additional physical or paperwork requirements still need confirmation. |
| Stop complete | Signed receiver document, or recorded arrival followed by departure / explicit delivery completion. |

Reviewed document assignments connect canonical load numbers to BOL and other shipping references. Trailer and seal numbers are excluded. Ambiguous references, explicit different loads, unreviewed/archived/unassigned documents, future events and unrelated historical work do not establish completion. Repeated receiver locations require a stop ID, sequence or distinct date. Freight POD does not complete trailer return.

Home and Full mission subscribe to same-tab Vault updates, cross-tab storage updates and page restoration. Derived completion is recalculated after Logbook edits and reload. Existing explicit manual confirmations are preserved.

The implementation ships through `scripts/finalize-checklist-evidence-v110321.mjs` at the end of the production materialization chain. Behavioral contracts cover identity, timing, multi-activity rows, ambiguity, document corrections and immutability. Mobile browser checks use synthetic accounts and intercepted external calls to verify actual UI updates, reload and unchanged recorded days.
