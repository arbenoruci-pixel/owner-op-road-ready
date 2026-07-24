# Document readers

Each folder owns one document type.

- `rate-confirmation`: broker, rate, stops, equipment and instructions.
- `bol`: shipper, consignee, commodity, weight and BOL information.
- `pod`: delivery, receiver, signature and delivery exceptions.
- `fuel-receipt`: merchant, gallons, price, location and truck information.

A reader may be improved independently. Its fixtures, extraction prompts, OCR rules and normalization stay inside its own folder. Readers cannot import one another and cannot write to Logbook, Routes or Records Vault.
