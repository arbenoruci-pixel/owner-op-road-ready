import assert from 'node:assert/strict';
import {
  buildSmartDocumentPlanV1040,
  inferExactDocumentTypeV1040,
  routeSmartDocumentV1040,
  splitSmartPacketV1040,
} from '../source/src/modules/scan/smartDocumentEngineV1040.js';

function analysis(text, type = 'other', fields = {}) {
  return {
    text,
    type:{ id:type, label:type },
    detectedType:{ id:type },
    confidence:.9,
    fields,
    fieldConfidence:Object.fromEntries(Object.keys(fields).map(key => [key,.94])),
    validation:{ checks:[] },
  };
}

const state = {
  activeLoad:{
    loadNo:'LD-77881',
    broker:'TQL',
    origin:'Chicago, IL',
    destination:'Dallas, TX',
  },
};
const profile = { fullName:'Test Driver', truckNumber:'214' };

const rate = buildSmartDocumentPlanV1040(analysis(`
CARRIER RATE CONFIRMATION
Broker: TQL
Load Number: LD-77881
Pickup: Chicago, IL
Delivery: Dallas, TX
Total Carrier Pay $4,900.00
`, 'rate_confirmation', { loadNo:'LD-77881', broker:'TQL', origin:'Chicago, IL', destination:'Dallas, TX', grossPay:4900, date:'07/16/2026' }), { state, profile, fileName:'rate-con.pdf' });
assert.equal(rate.exactType.id, 'rate_confirmation');
assert.ok(rate.routing.stacks.some(stack => stack.id === 'load_folder'));
assert.ok(rate.routing.stacks.some(stack => stack.id === 'broker_profile'));
assert.ok(rate.match.score >= 85);

const pod = buildSmartDocumentPlanV1040(analysis(`
PROOF OF DELIVERY
BOL Number ABC123456
Received By: Jane Receiver
Receiver Signature: JANE RECEIVER
Delivered 07/16/2026
`, 'pod', { loadNo:'ABC123456', date:'07/16/2026', receiver:'Jane Receiver', signaturePresent:true }), { state:{}, profile });
assert.equal(pod.exactType.id, 'pod');
assert.ok(pod.routing.stacks.some(stack => stack.id === 'factoring'));
assert.ok(pod.validation.valid);

const fuel = buildSmartDocumentPlanV1040(analysis(`
LOVE'S TRAVEL STOP
Date 07/16/2026
Gary, IN
Diesel 100.000 GALLONS
Price Per Gallon $3.500
Fuel Total $350.00
`, 'fuel_receipt', { date:'07/16/2026', merchant:"Love's", cityState:'Gary, IN', gallons:100, pricePerGallon:3.5, total:350 }), { state, profile });
assert.equal(fuel.exactType.id, 'fuel_receipt');
assert.ok(fuel.routing.stacks.some(stack => stack.id === 'ifta'));
assert.ok(fuel.routing.stacks.some(stack => stack.id === 'logbook'));
assert.ok(fuel.validation.valid);

const repair = inferExactDocumentTypeV1040(analysis(`
SERVICE INVOICE
Repair Order 9981
Labor $400.00
Parts $250.00
Work Performed: replace brake chamber
Total $650.00
`), { fileName:'shop-invoice.pdf' });
assert.equal(repair.id, 'repair_invoice');
const repairRoute = routeSmartDocumentV1040(repair.id, { date:'07/16/2026', total:650 }, { unit:'214', driver:'Test Driver', date:'07/16/2026' }, {});
assert.ok(repairRoute.stacks.some(stack => stack.id === 'maintenance'));

const medical = inferExactDocumentTypeV1040(analysis(`
MEDICAL EXAMINER'S CERTIFICATE
Federal Motor Carrier Safety Regulations
Driver Test Driver
Expiration Date 07/16/2027
`), { fileName:'medical-card.jpg' });
assert.equal(medical.id, 'medical_card');

const packetText = `[[PAGE 1]]
CARRIER RATE CONFIRMATION
Load Number LD-77881
Total Carrier Pay $4900
Pickup Chicago IL Delivery Dallas TX
[[PAGE 2]]
BILL OF LADING
BOL Number ABC123456
Shipper Chicago IL Consignee Dallas TX
[[PAGE 3]]
PROOF OF DELIVERY
Received By Jane Receiver
Receiver Signature Jane Receiver
[[PAGE 4]]
LOVE'S FUEL RECEIPT
100 GALLONS Price Per Gallon 3.50 Total 350.00`;
const packet = splitSmartPacketV1040(analysis(packetText, 'other'), { fileName:'mixed-packet.pdf' });
assert.ok(packet.isPacket);
assert.ok(packet.documentCount >= 3);

console.log('PASS v104.0 Smart Truck Document Intelligence Engine');
