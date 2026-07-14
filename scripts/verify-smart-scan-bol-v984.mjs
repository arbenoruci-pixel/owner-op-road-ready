import { classifyDocument } from '../source/src/modules/scan/smartScan.js';
import {
  extractProDocumentFieldsV984,
  sanitizeExtractedFieldsV984,
  scoreExtractedFieldsV984,
} from '../source/src/modules/scan/smartScanExtractionV984.js';

const sample = `
07/10/2026
BILL OF LADING - NOT NEGOTIABLE
Bill of Lading Number: IF5654
SHIP FROM
Garden of Light Inc.
127 Park Avenue
East Hartford CT 06108
United States
SHIP TO
Greenwood DC
486 E Stop 18 Road
Greenwood IN 46143-9537
United States
Customer P.O. Number: 7520262581
Carrier Name:
Seal #: 856020
Trailer #:
Commodity Description
ALD-GRA-001 Aldi's Superfoods Dark Chocolate Sea Salt Coconut Cacao
Total Qty Pieces: 720
Total Weight: 5533.88 lbs
Shipper Signature/Date
Driver Signature
Check In (Guard): 12:06
Appointment Time: 1 AM
Unloaded & Signed Out: 1:45
`;

const classification = classifyDocument(sample, 'scan.jpg');
if (classification.type?.id !== 'bol' || Number(classification.confidence || 0) < .75) {
  throw new Error(`BOL classification failed: ${classification.type?.id} ${classification.confidence}`);
}

const fields = sanitizeExtractedFieldsV984(extractProDocumentFieldsV984(sample, 'bol'), 'bol');
const expected = {
  date:'07/10/2026',
  loadNo:'IF5654',
  bolNo:'IF5654',
  poNumber:'7520262581',
  seal:'856020',
  trailerNo:'',
  origin:'East Hartford, CT',
  destination:'Greenwood, IN',
};
for (const [key, value] of Object.entries(expected)) {
  if ((fields[key] || '') !== value) throw new Error(`BOL field ${key} failed: expected ${value}, got ${fields[key]}`);
}
if (Math.abs(Number(fields.weight || 0) - 5533.88) > .01) throw new Error(`BOL weight failed: ${fields.weight}`);
if (Number(fields.totalPieces || 0) !== 720) throw new Error(`BOL pieces failed: ${fields.totalPieces}`);
if (fields.checkIn !== '12:06' || fields.appointmentTime !== '1 AM' || fields.checkOut !== '1:45') {
  throw new Error(`BOL stop times failed: ${fields.checkIn}, ${fields.appointmentTime}, ${fields.checkOut}`);
}

const noisy = sanitizeExtractedFieldsV984({
  loadNo:'NUMBER',
  bolNo:'NUMBER',
  origin:'Garde',
  destination:'ir',
  date:'',
}, 'bol');
if (noisy.loadNo || noisy.bolNo || noisy.origin || noisy.destination) {
  throw new Error(`Noisy placeholder cleanup failed: ${JSON.stringify(noisy)}`);
}

const score = scoreExtractedFieldsV984('bol', fields);
if (score.coverage < .9 || score.criticalMissing.length) {
  throw new Error(`BOL field score failed: ${JSON.stringify(score)}`);
}

console.log('verify-smart-scan-bol-v984 passed');
