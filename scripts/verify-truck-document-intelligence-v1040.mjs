import assert from 'node:assert/strict';
import {
  classifyPacketPagesV1040,
  classifyTruckDocumentTextV1040,
} from '../source/src/modules/scan/truckDocumentEngineV1040.js';
import {
  backendDocumentTypeV1040,
  documentLinkableV1040,
  truckDocumentTypeMetaV1040,
} from '../source/src/modules/scan/truckDocumentCatalogV1040.js';

const cases = [
  ['rate_confirmation', `RATE CONFIRMATION
Broker: Total Quality Logistics
Load Number: 123456
Total Carrier Pay $2,450.00
Pickup Chicago, IL
Deliver To Dallas, TX`],
  ['bol', `BILL OF LADING
B/L No 99881
SHIPPER ACME FOODS
CONSIGNEE WALMART DC
Seal No 12345
Gross Weight 42100`],
  ['pod', `BILL OF LADING
Load # 99881
PROOF OF DELIVERY
RECEIVED BY JOHN SMITH
Receiver Signature`],
  ['lumper_receipt', `CAPSTONE LOGISTICS
LUMPER RECEIPT
PO 88431
Unloading service
TOTAL $275.00`],
  ['detention_approval', `DETENTION APPROVAL
Load # 44321
Authorization #D-99
Approved amount $150.00
Check in 10:00 Check out 13:00`],
  ['tonu', `TRUCK ORDERED NOT USED
TONU
Load #8841
Approved $250.00`],
  ['scale_ticket', `CAT SCALE
SCALE TICKET
Steer Axle 11800
Drive Axle 33800
Trailer Axle 32900
Gross Weight 78500`],
  ['fuel_receipt', `LOVE'S TRAVEL STOP
Gary, IN 46402
DIESEL
Gallons 102.450
Price / gal $3.459
TOTAL $354.36`],
  ['repair_invoice', `REPAIR INVOICE
Invoice #R-8831
VIN 1FUJGLDR9DLBT1234
Labor $450.00
Parts $800.00
Total $1250.00`],
  ['medical_card', `MEDICAL EXAMINER'S CERTIFICATE
Driver: Arben Oruci
Qualified under 49 CFR
Expiration 07/16/2027`],
  ['registration', `VEHICLE REGISTRATION
VIN 1FUJGLDR9DLBT1234
License Plate P123456
Expiration 12/31/2026`],
  ['annual_inspection', `ANNUAL VEHICLE INSPECTION REPORT
49 CFR 396
VIN 1FUJGLDR9DLBT1234
Inspector John Doe`],
  ['certificate_of_insurance', `ACORD 25
CERTIFICATE OF INSURANCE
Policy Number ABC12345
Certificate Holder
Expiration 07/16/2027`],
  ['broker_packet', `BROKER SETUP PACKET
Carrier Packet
Broker: Example Logistics
MC 123456`],
  ['notice_of_assignment', `NOTICE OF ASSIGNMENT
All invoices have been assigned to RTS Financial
Remit all payments to RTS Financial, 9300 Metcalf Ave`],
  ['w9', `Form W-9
Request for Taxpayer Identification Number
Business Name ROAD READY LLC
EIN XX-XXX1234`],
  ['form_2290', `Form 2290
Heavy Highway Vehicle Use Tax Return
Schedule 1
VIN 1FUJGLDR9DLBT1234`],
  ['accident_report', `ACCIDENT REPORT
Case #A-5531
Location: Chicago, IL
Collision involving tractor trailer`],
];

for (const [expected, text] of cases) {
  const result = classifyTruckDocumentTextV1040({ text });
  assert.equal(result.type.id, expected, `${expected} misclassified as ${result.type.id}`);
  assert.ok(result.confidence >= .75, `${expected} confidence too low`);
}
console.log(`PASS ${cases.length} document families classified`);

const contextMatch = classifyTruckDocumentTextV1040({
  text:`Carrier paperwork
Load Number 777888
Total Carrier Pay $1800
Pickup Joliet IL
Delivery Atlanta GA`,
  baseTypeId:'rate_confirmation',
  context:{ loadNo:'777888' },
});
assert.equal(contextMatch.type.id, 'rate_confirmation');
assert.ok(contextMatch.evidence.some(item => item.source === 'active-load'));
console.log('PASS active-load context matching');

const packet = classifyPacketPagesV1040(`[[PAGE 1]]
RATE CONFIRMATION
Load Number 555
Total Carrier Pay $1500
Pickup A
Deliver To B
[[PAGE 2]]
BILL OF LADING
B/L No 555
SHIPPER ACME
CONSIGNEE STORE
[[PAGE 3]]
PROOF OF DELIVERY
Load #555
Received By J Smith
Receiver Signature`, { pageCount:3 });
assert.equal(packet.isMixed, true);
assert.equal(packet.segments.length, 3);
assert.deepEqual(packet.segments.map(segment => segment.type.id), ['rate_confirmation','bol','pod']);
console.log('PASS mixed packet page segmentation');

assert.equal(backendDocumentTypeV1040('pod'), 'pod');
assert.equal(backendDocumentTypeV1040('repair_invoice'), 'other');
assert.equal(documentLinkableV1040('fuel_receipt'), true);
assert.equal(documentLinkableV1040('medical_card'), false);
assert.equal(truckDocumentTypeMetaV1040('notice_of_assignment').stacks.includes('factoring'), true);
assert.equal(truckDocumentTypeMetaV1040('fuel_receipt').stacks.includes('ifta'), true);
assert.equal(truckDocumentTypeMetaV1040('repair_invoice').stacks.includes('maintenance'), true);
console.log('PASS backend compatibility and filing stacks');

const unknown = classifyTruckDocumentTextV1040({ text:'hello this is an unrelated note' });
assert.equal(unknown.type.id, 'other');
assert.ok(unknown.confidence < .6);
console.log('PASS low-evidence documents stay in Smart Inbox');

console.log('PASS — Truck Document Intelligence v104.0 regression suite');
