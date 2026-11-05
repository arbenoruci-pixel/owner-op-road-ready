# Shipment completion confirmations

The filing picker previously treated old unlinked pickup references as open indefinitely when delivery used another reference or left it blank. It also treated an empty drop-and-hook's delivered reference as a new pickup.

This release recognizes an explicit delivered reference, skips declared empty moves as pickups, and reads owner-confirmed closeouts from `road_ready_shipment_reviews`. Each confirmation matches the driver, pickup event, day and normalized reference. Reusing a BOL on another pickup does not inherit the old completion. Append a later `open` review to withdraw a confirmation.

The table is separate from signed log days, device ownership and account workspace writes. Authenticated clients can only read their own rows. Authorized support can append confirmations after explicit owner approval. No delivery date, broker identity, POD signature or payment status is inferred from a confirmation. No historical user identities or shipment data belong in source control.

The app receives confirmations in the background and caches them per authenticated account for offline use. Failures retain the last received copy; account changes discard in-flight responses. Only operational Home and filing projections consume the metadata. The DOT workflow lock remains unchanged.

Validation: `node scripts/shipment-closeouts/core.test.mjs` and `node scripts/shipment-closeouts/client.test.mjs` after the final installer, followed by the normal build and DOT runtime lock checks.
