import {textObservation} from '../src/input.js';
// Synthetic counterpart of a numbered stop table and matching terms footer.
export const numberedRateText=[`LOAD CONFIRMATION
Load # 24680
Document Date 09/24/2026
Equipment Van
Equipment Length 53'
Distance 429
First Pickup Date 09/24/2026 20:00
EXAMPLE LOGISTICS, INC.
8805 EXAMPLE DR
WILLIAMSVILLE, NY 14221
Phone Number: 5550000000
Carrier Information
EXAMPLE CARRIER LLC DOT Number: Contact Name:
undefined undefined, undefined
MC Number: MC000000
Stops /Actions
# Action Date/Time Location Contact
1 Pickup 09/24/26 20:00 SAMPLE WATER Main Contact
Factory Phone: 5550000001
120 Example Drive
Kingfield, ME 04947
References: REF-123456
2 Delivery 09/25/26 08:00 SAMPLE MARKET Main Contact
1 Sample Dr Phone: 5550000002
Rockleigh, NJ 07647
Pay Items
Description Note Quantity Rate Amount
BA 1 1700.00 USD 1700.00
Total USD 1700.00
Accounting Email: billing@example.test
Notes andReferences
All invoices must include a signed rate confirmation and a signed delivery receipt.
The carrier must provide a POD issued by the shipper and signed by the receiver.
Page 1 out of 2 | Load #24680`,
`The driver must activate tracking for detention.
Delivery to be eligible for detention time. YOU MUST also get a Time Stamp with a
signature on the BOL for detention approval. A copy of the lumper receipt and any
accessorial requests must be submitted with the freight bill.
THE RATE IS ALL-INCLUSIVE. All invoices must include a signed rate confirmation and a
signed delivery receipt.
Dispatcher Signature Date
Print Name Signature Date
Driver Name Driver Cell Phone #
Page 2 out of 2 | Load #24680`];
export const numberedRateInput=(texts=numberedRateText)=>({documentId:'synthetic-numbered-rate',pages:texts.map((text,i)=>({id:'page-'+(i+1),number:i+1,observations:[{...textObservation(text),source:'pdf-text-layer',sourceImageId:'synthetic-native-'+(i+1)}]}))});
