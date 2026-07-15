import assert from 'node:assert/strict';
import { parseRateConfirmationV102 } from '../source/src/modules/scan/rateConfirmationParserV102.js';

const text = `
[[PAGE:1]]
H & N Logistics, LLC Agent
West Indiana Office
Order #: 391912 Phone: 765-201-7300
Fax: 608-829-6483
Leg #: 395851 rateconfirmations@hnlogisticsllc.com
7/14/2026 3:00:25 PM 1 of 10
[[PAGE:2]]
H & N Logistics, LLC Agent
Trailer Type: Reefer
Carrier Information Reference Numbers
Carrier: Narta Express LLC
Pickup #: 5010037538
MC Number: MC871792
Stop Information
Load At Pieces Weight
ROCHELLE MIXING CENTER Earliest date: 07/14/26 00:00 4,366 CA 41,482 LBS
600 WISCOLD DR Latest date: 07/14/26 08:48
Rochelle, IL61045
Pickup #: 5010037538, PO Number: 26242159510
Commodity: FROZEN MEAT
Deliver To Pieces Weight
SYSCO ST PAUL Earliest date: 07/15/26 06:00 1,463 CA 16,434 LBS
2400 COUNTY ROAD J Latest date: 07/15/26 06:00
Mounds View, MN55112
Phone: 763-785-9000
Pickup #: 5010037538, PO Number: 26144210
Commodity: FROZEN MEAT
[[PAGE:3]]
Deliver To Pieces Weight
HOLIDAY PANTRY BROOKLYN CENTER Earliest date: 07/15/26 12:00 1,215 CA 6,171 LBS
6890 SHINGLE CREEK PKWY Latest date: 07/15/26 12:00
Brooklyn Center, MN55430
Pickup #: 5010037538, PO Number: 2792
Commodity: FROZEN MEAT
Deliver To Pieces Weight
REINHART FOODSERVICE Earliest date: 07/16/26 07:00 693 CA 6,400 LBS
13400 COMMERCE BLVD Latest date: 07/16/26 07:00
Rogers, MN55374
Pickup #: 5010037538, PO Number: 26150893478
Commodity: FROZEN MEAT
Deliver To Pieces Weight
SYSCO SAINT CLOUD Earliest date: 07/17/26 06:00 331 CA 3,677 LBS
900 HIGHWAY 10 S Latest date: 07/17/26 06:00
SAINT CLOUD, MN56304
Pickup #: 5010037538, PO Number: 4929910
Commodity: FROZEN MEAT
Deliver To Pieces Weight
ROMA Earliest date: 07/17/26 09:00 664 CA 8,800 LBS
625 Division St N Latest date: 07/17/26 09:00
Rice, MN56367
Pickup #: 5010037538, PO Number: 26242159510
Commodity: FROZEN MEAT
Remarks
4,366 CA 41,482 LBS
[[PAGE:6]]
Confirmation of Contract Carrier Verbal Rate Agreement
Both Parties agree that BROKERS reference number 391912 will move at the following rate:
Pay Information
Description Quantity Rate Unit Amount
Load Broker Line Haul 1.00 4,800.00 FLT $4,800.00
Total Pay (US$): $4,800.00
`;

const result = parseRateConfirmationV102(text);
assert.equal(result.loadNo, '391912');
assert.equal(result.orderNo, '391912');
assert.equal(result.legNo, '395851');
assert.equal(result.broker, 'H & N Logistics, LLC');
assert.equal(result.carrierName, 'Narta Express LLC');
assert.equal(result.mcNumber, 'MC871792');
assert.equal(result.equipment, 'Reefer');
assert.equal(result.pickupNumber, '5010037538');
assert.equal(result.origin, 'Rochelle, IL');
assert.equal(result.nextStop, 'Mounds View, MN');
assert.equal(result.destination, 'Rice, MN');
assert.equal(result.pickupDate, '07/14/2026');
assert.equal(result.deliveryDate, '07/17/2026');
assert.equal(result.total, 4800);
assert.equal(result.linehaul, 4800);
assert.equal(result.totalPieces, 4366);
assert.equal(result.weight, 41482);
assert.equal(result.commodity, 'FROZEN MEAT');
assert.equal(result.stops.length, 6);
assert.equal(result.deliveryCount, 5);
assert.ok(result.routeSummary.includes('PU 07/14/2026 00:00 - ROCHELLE MIXING CENTER, Rochelle, IL'));
assert.ok(result.routeSummary.includes('D5 07/17/2026 09:00 - ROMA, Rice, MN'));
assert.ok(result.poNumbers.includes('26242159510'));
assert.ok(result.poNumbers.includes('26150893478'));
assert.equal(result.needsFieldReview, false);

console.log('verify-rate-confirmation-v102 passed');
