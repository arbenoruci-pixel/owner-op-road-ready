import { classifyDocument } from '../source/src/modules/scan/smartScan.js';
import { extractProDocumentFields } from '../source/src/modules/scan/smartScanExtractionPro.js';

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
Carrier Name: Narta Express
Trailer #: 856020
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
if (classification.type?.id !== 'bol' || Number(classification.confidence || 0) < 0.75) {
  throw new Error(`BOL classification failed: ${classification.type?.id} ${classification.confidence}`);
}

const fields = extractProDocumentFields(sample, 'bol');
const expected = {
  loadNo:'IF5654',
  poNumber:'7520262581',
  trailerNo:'856020',
  origin:'East Hartford, CT',
  destination:'Greenwood, IN',
};
for (const [key, value] of Object.entries(expected)) {
  if (fields[key] !== value) throw new Error(`BOL field ${key} failed: expected ${value}, got ${fields[key]}`);
}
if (Math.abs(Number(fields.weight || 0) - 5533.88) > 0.01) throw new Error(`BOL weight failed: ${fields.weight}`);
if (Number(fields.totalPieces || 0) !== 720) throw new Error(`BOL pieces failed: ${fields.totalPieces}`);
if (!fields.checkIn || !fields.appointmentTime || !fields.checkOut) throw new Error('BOL stop times were not extracted');

console.log('verify-smart-scan-bol-v983 passed');
