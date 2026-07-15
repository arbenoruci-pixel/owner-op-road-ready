import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readPdfTextV100 } from '../source/src/modules/scan/pdfTextV100.js';
import { applySmartDocumentLinkV100, suggestSmartDocumentLinkV100 } from '../source/src/modules/scan/smartDocumentLinkV100.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readerPath = path.join(ROOT, 'source/src/modules/scan/smartDocumentReaderV100.js');
let readerSource = fs.readFileSync(readerPath, 'utf8');
readerSource = readerSource.replace(
  "  let city = clean(match[1]);",
  "  let city = clean(match[1]).replace(/^(?:I|l|1)\\s+(?=[A-Z])/i, '');"
);
readerSource = readerSource.replace(
  "    if (after.length >= 2) city = after;",
  "    if (after.length >= 2) city = after;\n    city = city.replace(/^(?:I|l|1)\\s+(?=[A-Z])/i, '');"
);
fs.writeFileSync(readerPath, readerSource);
const { parseBolFieldsV100, parseFuelReceiptFieldsV100, parseRateConfirmationFieldsV100 } = await import(`${pathToFileURL(readerPath).href}?v=${Date.now()}`);

const bolText = `
BILL OF LADING - NOT NEGOTIABLE
[[FIELD:DATE]]
07/10/2026
[[FIELD:BOL_VALUE]]
Bill of Lading Number: IF8564
[[FIELD:BOL_BAR_TEXT]]
IF8564
[[FIELD:CUSTOMER_PO]]
Customer P.O. Number: 7520262581
[[FIELD:SEAL]]
Seal #: 585020
[[FIELD:SHIP_FROM]]
Garden of Light Inc.
127 Park Avenue
East Hartford CT 06108
United States
[[FIELD:SHIP_TO]]
Greenwood DC
486 E Stop 18 Road
Greenwood IN 46143-9537
United States
[[FIELD:PIECES]]
Total Qty Pieces: 720
[[FIELD:WEIGHT]]
Total Weight: 5533.88 lbs
[[FIELD:COMMODITY]]
ALD-GRA-001 Dark Chocolate Sea Salt Coconut Cacao
[[FIELD:STOP_TIMES]]
Check In (Guard): 12:06
Appointment Time: 1 AM
Unloaded & Signed Out: 1:45
Detected barcode values:
IF8564
`;
const bol = parseBolFieldsV100(bolText, {}, new Date('2026-07-14T12:00:00'));
const bolExpected = {
  date:'07/10/2026', loadNo:'IF8564', poNumber:'7520262581', seal:'585020', totalPieces:720, weight:5533.88,
  origin:'East Hartford, CT', destination:'Greenwood, IN', checkIn:'12:06', appointmentTime:'1 AM', checkOut:'1:45',
};
for (const [key, value] of Object.entries(bolExpected)) if (bol[key] !== value) throw new Error(`v100 BOL ${key}: expected ${value}, got ${bol[key]}`);
if (!bol.shipFromDetails.startsWith('Garden of Light Inc.')) throw new Error(`v100 ship from failed: ${bol.shipFromDetails}`);
if (!bol.shipToDetails.startsWith('Greenwood DC')) throw new Error(`v100 ship to failed: ${bol.shipToDetails}`);

const rateText = `Carrier Rate Confirmation
Load Number: 1243484
Broker: Example Logistics LLC
Pickup Date: 07/14/2026
Pickup: East Hartford CT 06108
Delivery Date: 07/15/2026
Delivery: Batavia IL 60510
Equipment: 53 ft Reefer
Linehaul: $4,500.00
Fuel Surcharge: $400.00
Total Carrier Pay: $4,900.00`;
const rate = parseRateConfirmationFieldsV100(rateText, {}, new Date('2026-07-14T12:00:00'));
if (rate.loadNo !== '1243484' || rate.total !== 4900 || rate.pickupDate !== '07/14/2026' || rate.deliveryDate !== '07/15/2026') throw new Error(`v100 rate con failed: ${JSON.stringify(rate)}`);

const fuelText = `Mudflap Fuel Receipt
Transaction Date: 07/14/2026
Fueling Location: Pilot Travel Center, Rochelle, IL
Gallons: 120.500
Price per gallon: $3.250
Amount Paid: $391.63
Mudflap Savings: $28.40
Transaction ID: MF-778899`;
const fuel = parseFuelReceiptFieldsV100(fuelText, {}, new Date('2026-07-14T12:00:00'));
if (fuel.fuelProvider !== 'Mudflap' || fuel.gallons !== 120.5 || fuel.total !== 391.63 || fuel.transactionId !== 'MF-778899') throw new Error(`v100 Mudflap failed: ${JSON.stringify(fuel)}`);

const pdfSource = `%PDF-1.4
1 0 obj << /Type /Page >> endobj
2 0 obj << /Length 150 >>
stream
BT
(Rate Confirmation) Tj
(Load Number: 445566) Tj
(Total Carrier Pay: $3200.00) Tj
ET
endstream
endobj
%%EOF`;
const pdfFile = { name:'rate-confirmation.pdf', type:'application/pdf', arrayBuffer:async () => new TextEncoder().encode(pdfSource).buffer };
const pdf = await readPdfTextV100(pdfFile);
if (!/Rate Confirmation/i.test(pdf?.text || '') || !/445566/.test(pdf?.text || '')) throw new Error(`v100 PDF reader failed: ${pdf?.text || ''}`);

const state = {
  activeDay:'2026-07-14',
  currentStatus:'ON',
  eventsByDay:{
    '2026-07-14':[
      { id:'pickup_1', status:'ON', startMin:600, endMin:630, city:'East Hartford', state:'CT', note:'Pickup / Loading', description:'', destination:'Greenwood, IN' },
    ],
  },
  routeLegsByDay:{
    '2026-07-14':[{ id:'leg_pickup_1', day:'2026-07-14', pickupDay:'2026-07-14', pickupEventId:'pickup_1', fromCity:'East Hartford', fromState:'CT', toCity:'Greenwood', toState:'IN', shippingDocs:'', loadNo:'', status:'open' }],
  },
  loadInfo:{},
  certifyStatus:{ '2026-07-14':'Certified' },
};
const suggestion = suggestSmartDocumentLinkV100(state, 'bol', { ...bol, date:'2026-07-14' });
if (suggestion.day !== '2026-07-14' || suggestion.eventId !== 'pickup_1') throw new Error(`v100 link suggestion failed: ${JSON.stringify(suggestion)}`);
const linked = applySmartDocumentLinkV100(state, {
  type:{ id:'bol', label:'Bill of Lading' },
  fields:{ ...bol, date:'2026-07-14', linkDay:'2026-07-14', linkEventId:'pickup_1', linkToLogbook:true },
  localDocument:{ local_id:'doc_bol_1', client_document_id:'client_1', original_file_name:'bol.jpg' },
  analysis:{ confidence:.92 },
});
const linkedEvent = linked.eventsByDay['2026-07-14'][0];
if (linkedEvent.shippingDocs !== 'IF8564' || linkedEvent.po !== '7520262581' || linkedEvent.shippingDocumentId !== 'doc_bol_1') throw new Error(`v100 event link failed: ${JSON.stringify(linkedEvent)}`);
if (linked.loadInfo.loadNo !== 'IF8564' || linked.loadInfo.shippingDocumentId !== 'doc_bol_1') throw new Error(`v100 load link failed: ${JSON.stringify(linked.loadInfo)}`);
if (linked.certifyStatus['2026-07-14'] !== 'Needs Recertification') throw new Error('v100 signed-day recertification failed');

console.log('verify-smart-document-v100 passed');
