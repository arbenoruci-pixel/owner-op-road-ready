# Recorded-day route scope — 110.3.74

## Report and evidence boundary
The driver reports an unrelated Charleston load on a historical log day. The supplied single-day backup contains its own New York route and pickup, with the same reference in the signed snapshot. Charleston does not occur anywhere in that backup. The backup omits the global load selection and other days' route rows, so the exact Charleston row on the phone cannot be identified from this file alone. No driver backup, signature, GPS coordinates or customer document is committed.

The exact 110.3.73 materialized code reproduces a real fallback defect: adding a synthetic earlier open Charleston guide with no recorded pickup makes it appear on an unrelated selected day when its guide/reference is globally active. Changing only the global selection removes it. With no global scope and no day references, the old fallback also accepts every earlier open route.

## Narrow correction
Recorded pickup-to-delivery/next-pickup history remains the primary source. For unconfirmed legacy rows, their own declared pickup/delivery day remains available; cross-day association requires a real selected-day event link or reference. Today's active guide/reference and absent scope are no longer sufficient. Voided, deleted and synthetic day rows cannot provide fallback links or references.

The patch changes read-only route selection. It does not delete the original Charleston route from its stored day, change duty-status records, infer a trip, rewrite signatures, alter saved mileage, erase edit history, reset storage or connect to any account. Existing route tombstones and excluded-day intent remain authoritative. Reader 0.3.18 and the published Driving midnight fix remain unchanged. PR #120 stays separate.

## Verification
Eighteen new pure tests were replayed against archived exact 110.3.73: ten failed before the correction; all eighteen pass afterward. Existing local active-shipment, route-authority, route-deletion, route-removal and load-cleanup suites pass, as do the eleven locked-file checks. The full build re-runs the final materialized shipment and graph contracts, including React-dependent tests that the local dependency-free harness does not execute.

Compiled Chromium/WebKit fixtures verify a New York day route stays visible with or without an unrelated Charleston guide selected, that Charleston is absent from that day's Form routes, that the other-day original is preserved, and that reload leaves duty records, signature data, audit entries and manual mileage unchanged. Exact-head CI and preview must pass before publication. Physical iPhone verification and the exact global Charleston row remain outside the single-day evidence.
