# Document recognition and source review

The reader has 80 profiles. These are evidence-based document rules, not a newly trained OCR model. A title and independent field structure establish a type; uncertain or conflicting values retain their source and require review. A missing field never receives an invented highlight.

## Research sources

- [New York DMV vehicle Bill of Sale](https://dmv.ny.gov/forms/mv912.pdf): ownership document fields include vehicle identification, buyer, seller, year, make and model. Its auction/sale location is not a freight delivery destination.
- [Virginia DMV IRP](https://www.dmv.virginia.gov/businesses/motor-carriers/irp): IRP cab cards are vehicle registration credentials; retain the readable original.
- [IRS supporting business records](https://www.irs.gov/businesses/small-businesses-self-employed/what-kind-of-records-should-i-keep): receipts and invoices describe payee, date, amount and purchased goods/services.
- [IRS Publication 463, documentary evidence](https://www.irs.gov/publications/p463): meal and hotel receipts have distinct date, merchant and charge information. The reader only categorizes evidence and makes no tax-deductibility decision.

## Review behavior

Source review opens as a native fullscreen dialog. Next confirms the current value and opens the next unchecked item. Skipped fields remain unchecked and are not silently accepted. Exact image coordinates drive highlighting and automatic zoom; pinch, pan and zoom buttons inspect the same image. Finishing a saved-document review explicitly saves the review to the existing document record, with its original and load assignment intact.

## Supported profiles

| Document | Fields |
|---|---|
| Rate confirmation | Load / PRO number, Total carrier rate, Broker, Carrier, Shipper, Consignee, Pickup date, Delivery date, Equipment, Miles, Weight, Pickup address, Pickup appointment, Delivery address, Delivery appointment |
| Invoice | Invoice number, Vendor, Invoice date, Subtotal, Tax, Total, Currency |
| Bill of lading | BOL number, Shipper, Consignee, Carrier, Trailer number, Ship date, PO number, Weight |
| Unloading receipt | Receipt number, Receipt date, Carrier, Location, PO number, Trailer number, Unloading amount, Checkout fee, Receipt total, Currency |
| Bill of sale | VIN / serial number, Unit number, Document date, Seller, Buyer, Sale location, Sale price, Year, Make, Model, Bidder number |
| Meal / restaurant receipt | Receipt number, Document date, Merchant, Subtotal, Tax, Total, Currency, Tip |
| Grocery receipt | Receipt number, Document date, Merchant, Subtotal, Tax, Total, Currency |
| Hotel / lodging receipt | Receipt number, Document date, Merchant, Subtotal, Tax, Total, Currency, Guest, Room, Arrival date, Departure date |
| Shower receipt | Receipt number, Document date, Merchant, Subtotal, Tax, Total, Currency |
| Laundry receipt | Receipt number, Document date, Merchant, Subtotal, Tax, Total, Currency |
| Equipment rental receipt | Receipt number, Document date, Merchant, Subtotal, Tax, Total, Currency, Unit number |
| Driver vehicle inspection report | VIN, Unit number, Expiration date, Effective date, Plate, Owner, Document date, Driver, Defects |
| Roadside inspection report | VIN, Unit number, Expiration date, Effective date, Plate, Owner, Document date, Report number, Carrier, Violations |
| UCR registration | Business name, DOT number, Registration year, Document date |
| Purchase order | PO number, Document date, Vendor, Buyer, Order total |
| Customs commercial invoice | Invoice number, Document date, Exporter, Importer, Country of origin |
| Customs entry summary | Entry number, Document date, Importer, Port |
| Hazardous materials shipping paper | Document date, UN / NA number, Proper shipping name, Hazard class, Packing group |
| Certificate of origin | Document date, Exporter, Producer, Country of origin |
| Lumper authorization | Load number, Document date, Approved amount |
| Proof of delivery | BOL number, Shipper, Consignee, Carrier, Trailer number, Ship date, PO number, Weight, Load number, Received by, Delivery date |
| Delivery receipt | Load number, BOL number, Carrier, Document date, Shipper, Consignee, Trailer number, Seal number, Weight, Received by, Delivery date |
| Load tender | Load number, BOL number, Carrier, Document date, Shipper, Consignee, Trailer number, Seal number, Weight |
| Packing list | Load number, BOL number, Carrier, Document date, Shipper, Consignee, Trailer number, Seal number, Weight, PO number, Quantity |
| Gate pass | Load number, BOL number, Carrier, Document date, Shipper, Consignee, Trailer number, Seal number, Weight, Appointment, Gate, Door |
| Detention approval | Load number, Document date, Approved amount, Approved by, Hours |
| Layover approval | Load number, Document date, Approved amount, Approved by, Hours |
| Truck ordered not used | Load number, Document date, Approved amount, Approved by, Hours |
| Scale ticket | Receipt number, Document date, Merchant, Subtotal, Tax, Total, Currency, Unit number, Steer axle weight, Drive axle weight, Trailer axle weight, Gross weight |
| Reefer temperature record | Load number, BOL number, Carrier, Document date, Shipper, Consignee, Trailer number, Seal number, Weight, Set point, Return air, Supply air |
| OS&D / exception report | Load number, BOL number, Carrier, Document date, Shipper, Consignee, Trailer number, Seal number, Weight, Exception |
| Freight claim notice | Load number, BOL number, Carrier, Document date, Shipper, Consignee, Trailer number, Seal number, Weight, Claim number, Claim amount |
| Carrier invoice | Invoice number, Document date, Vendor, Bill to, Subtotal, Tax, Total, Load number, BOL number, Carrier, Remit to |
| Fuel receipt | Receipt number, Document date, Merchant, Subtotal, Tax, Total, Currency, Gallons, Price per gallon, Fuel state |
| Fuel card statement | Statement number, Document date, Statement period, Total gallons, Total |
| Toll / parking receipt | Receipt number, Document date, Merchant, Subtotal, Tax, Total, Currency, Location, Entry, Exit |
| Trailer washout receipt | Receipt number, Document date, Merchant, Subtotal, Tax, Total, Currency, Trailer number |
| Truck wash receipt | Receipt number, Document date, Merchant, Subtotal, Tax, Total, Currency, Unit number |
| Tire receipt | Receipt number, Document date, Merchant, Subtotal, Tax, Total, Currency, Tire size, Quantity |
| Truck parts receipt | Receipt number, Document date, Merchant, Subtotal, Tax, Total, Currency, Part number, Quantity |
| Repair / service invoice | Invoice number, Document date, Vendor, Bill to, Subtotal, Tax, Total, VIN, Unit number, Odometer, Labor, Parts |
| Roadside service receipt | Receipt number, Document date, Merchant, Subtotal, Tax, Total, Currency, VIN, Unit number, Service location |
| Preventive maintenance record | VIN, Unit number, Document date, Odometer, Next service |
| Weigh station receipt | Receipt number, Document date, Merchant, Subtotal, Tax, Total, Currency, Unit number, Gross weight |
| Trip / fuel permit | VIN, Unit number, Expiration date, Effective date, Plate, Owner, Permit number, Jurisdiction |
| Oversize / overweight permit | VIN, Unit number, Expiration date, Effective date, Plate, Owner, Permit number, Permitted route, Dimensions |
| IFTA license | Business name, License number, Expiration date, License year |
| IFTA return / report | Quarter, Total miles, Tax-paid gallons, Tax due |
| CDL / driver license | License number, Driver name, Expiration date, Class |
| DOT medical card | Driver name, Expiration date, Medical examiner, Registry number |
| TWIC card | Driver name, Expiration date, Credential number |
| Passport | Passport number, Name, Expiration date, Nationality |
| Motor vehicle record | Driver name, License number, Document date, License status |
| Drug & alcohol compliance | Driver name, Document date, Reported result |
| Driver training certificate | Recipient, Document date, Course |
| Vehicle registration | VIN, Unit number, Expiration date, Effective date, Plate, Owner |
| IRP cab card | VIN, Unit number, Expiration date, Effective date, Plate, Owner |
| Insurance policy / card | Policy number, Insured, Effective date, Expiration date |
| Certificate of insurance | Policy number, Insured, Certificate holder, Effective date, Expiration date |
| Annual DOT inspection | VIN, Unit number, Expiration date, Effective date, Plate, Owner, Inspection date, Inspector |
| Vehicle title | VIN, Unit number, Expiration date, Effective date, Plate, Owner, Title number, Lienholder |
| Truck / trailer lease | VIN, Unit number, Expiration date, Effective date, Plate, Owner, Lessor, Lessee |
| Trailer interchange agreement | VIN, Unit number, Expiration date, Effective date, Plate, Owner, Carrier, Trailer number, Document date |
| Operating authority | Business name, Document date, Effective date, MC number, DOT number, Broker, Carrier |
| Broker packet | Business name, Document date, Effective date, MC number, DOT number, Broker, Carrier |
| Broker-carrier agreement | Business name, Document date, Effective date, MC number, DOT number, Broker, Carrier |
| Carrier setup form | Business name, Document date, Effective date, MC number, DOT number, Broker, Carrier |
| Form W-9 | Business name, Document date, Tax classification |
| Notice of assignment | Business name, Factor, Remit to, Effective date |
| Factoring verification | Business name, Document date, Effective date, MC number, DOT number, Broker, Carrier, Factor |
| ACH / direct deposit form | Business name, Bank name, Effective date |
| Carrier settlement | Settlement number, Document date, Gross pay, Deductions, Net pay |
| IRS Form 2290 | Business name, VIN, Tax period, Tax |
| Tax document | Tax year, Payer, Recipient, Reported income |
| Bank / card statement | Statement period, Opening balance, Closing balance |
| Business receipt | Receipt number, Document date, Merchant, Subtotal, Tax, Total, Currency |
| Accident / incident report | Report number, Document date, Location, Driver name, VIN |
| Police report | Case number, Document date, Officer, Location |
| Signature page | Document reference |
| Signing certificate | Document reference, Completion date |
