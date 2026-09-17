# Trucking document coverage

The source-review engine and the app previously had different catalogs. Engine
0.3.13 had invoice, BOL and unloading-receipt profiles. Version 0.3.14 covers every
existing app catalog type, plus trailer interchange and signature attachments.
The app classifier consults this same source-backed catalog before its older
fallbacks. A parity test fails when an app type has no source-review profile.

| Family | Types |
| --- | --- |
| Shipment | Rate confirmation, load tender, BOL, POD, delivery receipt, packing list, gate pass |
| Accessorial / cargo | Lumper, detention, layover, TONU, scale ticket, temperature record, OS&D, freight claim |
| Billing / expenses | Carrier invoice, general invoice, fuel receipt and statement, toll / parking, washout, truck wash, business receipt |
| Maintenance | Repair invoice, parts, tires, roadside service, preventive maintenance, weigh station receipt |
| Equipment / permits | Registration, IRP cab card, title, lease, trailer interchange, trip / fuel permit, oversize permit, annual inspection |
| Driver | CDL, medical card, TWIC, passport, MVR, drug / alcohol compliance, training certificate |
| Business | Insurance, COI, authority, broker packet, carrier agreement / setup, NOA, factoring verification, ACH, settlement |
| Tax / records | W-9, 2290, tax statement, IFTA license / return, bank statement, accident / police reports |
| Attachments | Signature page, signing certificate |

## Reference research

Public references were reviewed on September 17, 2026. These inform document
structure; the code does not fetch them or send customer documents to them.

- [Trulos rate-confirmation form](https://www.trulos.com/tools/print/rate/):
  separates shipment dates and references, pickup and consignee, carrier, freight
  details and agreed rate. Load payment must remain distinct from expense totals.
- [FedEx Freight BOL instructions and forms](https://www.fedexfreight.com/en-us/rate-ship/shipping/forms):
  distinguish the shipper's BOL number, purchase order, shipper reference, parties,
  handling units and commodity weight. These references retain separate roles.
- [Flock Freight's BOL and POD guide](https://www.flockfreight.com/blog/proof-of-delivery-vs-bill-of-lading-whats-the-difference):
  identifies delivery date and recipient confirmation as delivery evidence.
  Printed signature boxes alone do not turn a BOL into a completed POD.
- [CAT Scale weighing guide](https://catscale.com/how-to-weigh/): distinguishes
  steer, drive and trailer axle readings from gross weight. A scale fee is a
  monetary field, separate from weight.
- [Relay Payments](https://www.relaypayments.com/): covers separate fuel, lumper,
  scale and other road-expense transactions. The catalog keeps these expense
  categories separate from freight billing.
- [IRS W-9](https://www.irs.gov/pub/irs-pdf/fw9.pdf) and
  [Form 2290](https://www.irs.gov/pub/irs-pdf/f2290.pdf): form identities and tax
  fields belong to business records, never load-reference or carrier-pay fields.
- [FMCSA medical certificate](https://www.fmcsa.dot.gov/regulations/medical/medical-examiners-certificate-commercial-driver-medical-certification):
  identifies the driver certificate independently from shipment documents. The
  printed OMB form expiration must not become the driver's certificate expiry.

## Evidence and boundaries

- Titles require independent field structure; instructions mentioning documents
  and filenames are insufficient. Specific receipt / invoice structures refine
  their generic type within the same observation. Competing titles remain review.
- A completed delivery block can propose POD from a BOL. Printed empty signature
  boxes alone cannot. OCR text never verifies handwriting or legal delivery.
- Shipment, invoice, BOL, PO and document-signing references retain their roles.
- Stop-derived addresses and appointment strings retain source and continuation
  evidence and require confirmation. Numeric dates and units are not invented.
- Supporting signature pages retain their own identities. They do not contribute
  shipment fields or erase the primary document's fields. Unidentified pages and
  actual mixed documents still require boundary review.
- Explicit confirmation remains necessary. Automatic acceptance and filing are
  disabled; uncertain or conflicting field readings remain visible.

## Verification scope

Synthetic fixtures cover each document family and its principal labeled fields,
plus negative headings, conflicts, weak OCR, packet isolation and source offsets.
The supplied signed RateCon is checked locally without committing its contents.
These tests demonstrate supported structures; they do not establish universal
layout coverage or a calibrated accuracy rate on unseen customer documents.
