import { postProcessBolResultV990 } from '../source/src/modules/scan/smartScanProV990.js';

const text = `
BILL OF LADING - NOT NEGOTIABLE
Date: 07/10/2026
Bill of Lading Number: IF8564
Customer P.O. Number: 7520262581
Seal #: 585020
[[FIELD:SHIP_FROM]]
I of 1 adding Mumba E nee, Page 1 oft, I Garden of Light Inc.
127 Park Avenue
East Hartford CT 06108
United States
[[FIELD:SHIP_TO]]
HEIRS, ss, Carrlar H, in, Greenwood DC
486 E Stop 18 Road
Greenwood IN 46143-9537
United States
[[FIELD:WEIGHT]]
5533.88 lbs
Total Qty Pieces: 720
Lot Code 07/07/2027
`;

const result = postProcessBolResultV990({
  type:{ id:'bol' },
  confidence:.96,
  text,
  barcodes:['IF8564'],
  fields:{
    date:'07/07/2027',
    loadNo:'MP0215202652658',
    poNumber:'27520262581',
    seal:'0384',
    totalPieces:20,
    weight:5533.88,
    shipFromDetails:'Garden of Light Inc., 127 Park Avenue, East H',
    shipToDetails:'Greenwood DC, 488 E Swp',
  },
}, new Date('2026-07-14T12:00:00'));

const expected = {
  date:'07/10/2026',
  loadNo:'IF8564',
  poNumber:'7520262581',
  seal:'585020',
  totalPieces:720,
  weight:5533.88,
  origin:'East Hartford, CT',
  destination:'Greenwood, IN',
};

for (const [key, value] of Object.entries(expected)) {
  if (result.fields[key] !== value) throw new Error(`v99.0 ${key}: expected ${value}, got ${result.fields[key]}`);
}
if (!/^Garden of Light Inc\.?[, ]/i.test(result.fields.shipFromDetails)) throw new Error(`v99.0 ship from: ${result.fields.shipFromDetails}`);
if (!result.fields.shipToDetails.startsWith('Greenwood DC')) throw new Error(`v99.0 ship to: ${result.fields.shipToDetails}`);
if (result.confidence > .92) throw new Error(`v99.0 confidence gate too high: ${result.confidence}`);

const bad = postProcessBolResultV990({
  type:{ id:'bol' }, confidence:.99, text:'Bill of Lading Number: 6273\n[[FIELD:CUSTOMER_PO]] 27520262581', fields:{ loadNo:'6273' }, barcodes:[],
}, new Date('2026-07-14T12:00:00'));
if (bad.fields.loadNo) throw new Error(`v99.0 accepted numeric-only BOL: ${bad.fields.loadNo}`);
if (!bad.needsReview) throw new Error('v99.0 bad extraction was not flagged for review');

console.log('verify-smart-scan-v990 passed');
