import assert from 'node:assert/strict';
import { arbitrateDocumentTypeV104 } from '../source/src/modules/scan/documentTypeArbiterV104.js';
import { parseSmartDocumentTextByTypeV104 } from '../source/src/modules/scan/smartDocumentReaderV104.js';

const fileName = 'LoadConfirmation395851.pdf';
const source = `
[[PAGE:1]]
H & N Logistics, LLC
Order #: 391912
Leg #: 395851
Agent
West Indiana Office
Phone: 765-201-7300
Fax: 608-829-6483
rateconfirmations@hnlogisticsllc.com
7/14/2026 3:00:25 PM
1 of 10

[[PAGE:2]]
H & N Logistics, LLC
Order #: 391912
Leg #: 395851
Trailer Type: Reefer
Carrier Information
Carrier: Narta Express LLC
Phone: --
Fax: --
MC Number: MC871792
Reference Numbers
Pickup #: 5010037538
Stop Information
Load At
ROCHELLE MIXING CENTER
600 WISCOLD DR
Rochelle, IL61045
Earliest date: 07/14/26 00:00
Latest date: 07/14/26 08:48
4,366 CA 41,482 LBS
Pickup #: 5010037538, PO Number: 26242159510
Commodity: FROZEN MEAT
Temp Per/BOL
Deliver To
SYSCO ST PAUL
2400 COUNTY ROAD J
Mounds View, MN55112
Earliest date: 07/15/26 06:00
Latest date: 07/15/26 06:00
1,463 CA 16,434 LBS
Pickup #: 5010037538, PO Number: 26144210
Commodity: FROZEN MEAT
Temp Per/BOL

[[PAGE:3]]
H & N Logistics, LLC
Order #: 391912
Leg #: 395851
Deliver To
HOLIDAY PANTRY BROOKLYN CENTER
6890 SHINGLE CREEK PKWY
Brooklyn Center, MN55430
Earliest date: 07/15/26 12:00
Latest date: 07/15/26 12:00
1,215 CA 6,171 LBS
Pickup #: 5010037538, PO Number: 2792
Commodity: FROZEN MEAT
Temp Per/BOL
Deliver To
REINHART FOODSERVICE
13400 COMMERCE BLVD
Rogers, MN55374
Earliest date: 07/16/26 07:00
Latest date: 07/16/26 07:00
693 CA 6,400 LBS
Pickup #: 5010037538, PO Number: 26150893478
Commodity: FROZEN MEAT
Temp Per/BOL
Deliver To
SYSCO SAINT CLOUD
900 HIGHWAY 10 S
SAINT CLOUD, MN56304
Earliest date: 07/17/26 06:00
Latest date: 07/17/26 06:00
331 CA 3,677 LBS
Pickup #: 5010037538, PO Number: 4929910
Commodity: FROZEN MEAT
Temp Per/BOL
Deliver To
ROMA
625 Division St N
Rice, MN56367
Earliest date: 07/17/26 09:00
Latest date: 07/17/26 09:00
664 CA 8,800 LBS
Pickup #: 5010037538, PO Number: 26242159510
Commodity: FROZEN MEAT
Temp Per/BOL
Remarks
4,366 CA 41,482 LBS

[[PAGE:4]]
Carrier agrees that transportation of this load is being done under their operating authority.
ALL DRIVERS MUST FOLLOW THE TEMPERATURE STATED ON THE BILLS OF LADING PROVIDED BY THE SHIPPER.
Driver must make sure physical seal and seal number match what is recorded on BOLs at pickup and after each drop.
In and out times for detentions must be noted and signed on the BOL.
Lumper receipt must include Bill of lading/load reference number.
WE DO NOT PROVIDE REVISED RATE CONFIRMATION FOR LUMPER CHARGES.

[[PAGE:5]]
Detention Policy
A revised rate confirmation will be sent after approval.
Failure to comply with MacroPoint tracking will disqualify detention.

[[PAGE:6]]
Description Quantity Rate Unit Amount
Load Broker Line Haul 1.00 4,800.00 FLT $4,800.00
Total Pay (US$): $4,800.00
Pay Information
Confirmation of Contract Carrier Verbal Rate Agreement
Pursuant to our verbal agreement between H&N LOGISTICS LLC and Narta Express LLC.
`;

const decision = arbitrateDocumentTypeV104({
  fullText:source,
  fileName,
  preferredType:'bol',
});
assert.equal(decision.id, 'rate_confirmation');
assert.equal(decision.autoCorrected, true);
assert.ok(decision.scores.rate_confirmation > decision.scores.bol);

const fields = parseSmartDocumentTextByTypeV104('rate_confirmation', source, {}, new Date('2026-07-15T12:00:00Z'));
assert.equal(fields.loadNo, '391912');
assert.equal(fields.orderNo, '391912');
assert.equal(fields.legNo, '395851');
assert.equal(fields.total, 4800);
assert.equal(fields.linehaul, 4800);
assert.equal(fields.broker, 'H & N Logistics, LLC');
assert.equal(fields.carrierName, 'Narta Express LLC');
assert.equal(fields.mcNumber, 'MC871792');
assert.equal(fields.equipment, 'Reefer');
assert.equal(fields.pickupNumber, '5010037538');
assert.equal(fields.origin, 'Rochelle, IL');
assert.equal(fields.destination, 'Rice, MN');
assert.equal(fields.stopCount, 6);
assert.equal(fields.deliveryCount, 5);
assert.equal(fields.totalPieces, 4366);
assert.equal(fields.weight, 41482);
assert.equal(fields.needsFieldReview, false);

console.log('verify-smart-document-type-v104 passed');
