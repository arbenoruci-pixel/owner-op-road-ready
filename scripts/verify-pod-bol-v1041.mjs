import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyTruckDocumentTextV1040 } from '../source/src/modules/scan/truckDocumentEngineV1040.js';
import { inspectBolPodDocumentV1041, sanitizeBolPodFieldsV1041 } from '../source/src/modules/scan/podBolIntelligenceV1041.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function assert(condition, message) {
  if (!condition) throw new Error(`v104.1 regression failed: ${message}`);
  console.log(`PASS ${message}`);
}

const signedBol = `
RECEIVED, subject to individually determined rates or contracts agreed upon in writing between carrier and shipper.
This Bill of Lading is not subject to any tariffs or classifications.
B/L NO: 0025075693
PAGE: 1 of 1
DATE: 07/14/2026 07:41:00
ARRIVAL: 07/15/2026 06:00:00
PRINTED: 07/14/2026 07:41:07
CARRIER: H AND N LOGISTICS
FROM: TYSON ROCHELLE
600 WISCOLD DR
Rochelle, IL 61068
CONSIGNED TO: REINHART ROGERS
13400 COMMERCE BLVD
ROGERS, MN 55374-8917
SALES ORDER: 1018266585
DELIVERY: 8004932547
DRIVERS
To report any OS&D (Over, Short, Damaged) discrepancies, please contact OS&D Claims Department.
ROUTE CAR NO. 7005
SEALS NOS. 2552594 2552595 2552077 2552572 2552582
DROP NUMBER 3.0
FO# 5010037538
PRODUCT CODE QTY SHIPPED DESCRIPTION CUSTOMER ITEM NET WEIGHT
10000051374 40 JMYD FC SEC BIS SAND 12/4.9 OZ 81014 146.80
TOTAL UNITS: 693
TOTAL TARE: 507.59
PO#: 26150893478
TOTAL NET WEIGHT: 5,891.91
TOTAL WEIGHT: 6,399.50
Frozen Loads: Use temp setting of -10F
CUSTOMER COPY
PER
7-16-26
The original bill of lading accepted and signed by Consignee must be presented by Carrier to Shipper before payment of freight charges.
`;

const classification = classifyTruckDocumentTextV1040({ text:signedBol, fileName:'IMG_7741.jpeg' });
assert(classification.type.id === 'pod', 'signed customer-copy BOL is classified as POD');
assert(classification.arbitration?.to === 'pod', 'OS&D disclaimer is structurally overruled');

const profile = inspectBolPodDocumentV1041(signedBol);
assert(profile.bolDominant === true, 'BOL structure is dominant');
assert(profile.onlyOsdDisclaimer === true, 'printed OS&D instructions are identified as disclaimer text');
assert(profile.podEvidence === true, 'customer-copy signed-BOL evidence is detected');

const fields = sanitizeBolPodFieldsV1041('pod', signedBol, {
  loadNo:'efor',
  bolNo:'efor',
  total:6399.5,
  merchant:'fet',
  exceptionText:'OS&D (Over, Short, Damaged)',
  signaturePresent:true,
});
assert(fields.loadNo === '0025075693', 'exact B/L number replaces OCR word fragment');
assert(fields.bolNo === '0025075693', 'B/L number is preserved with leading zeros');
assert(fields.salesOrder === '1018266585', 'sales order is extracted');
assert(fields.deliveryNumber === '8004932547', 'delivery number is extracted');
assert(fields.poNumber === '26150893478', 'PO number is extracted');
assert(fields.routeCarNo === '7005', 'route car number is extracted');
assert(fields.foNumber === '5010037538', 'FO number is extracted');
assert(fields.totalPieces === 693, 'total units map to pieces');
assert(fields.netWeight === 5891.91, 'net weight is extracted');
assert(fields.weight === 6399.5 && fields.grossWeight === 6399.5, 'gross weight is extracted as weight');
assert(fields.total === '', 'total weight is never treated as money');
assert(fields.merchant === '', 'OCR fragment is removed from merchant');
assert(fields.exceptionText === '', 'printed OS&D instructions are removed from exception field');
assert(fields.origin === 'Rochelle, IL', 'shipper city and state are extracted');
assert(fields.destination === 'ROGERS, MN', 'consignee city and state are extracted');
assert(fields.temperature === '-10°F', 'reefer setting is extracted');
assert(fields.deliverySignedDate === '07/16/2026', 'latest signed-delivery date is extracted');
assert(fields.signatureLikely === true && fields.signaturePresent === false, 'signature is suggested for confirmation without being silently certified');

const originalBol = signedBol
  .replace(/CUSTOMER COPY[\s\S]*$/i, '')
  .replace(/To report any OS&D[^\n]+/i, 'Driver contact instructions');
const originalClassification = classifyTruckDocumentTextV1040({ text:originalBol, fileName:'bol-0025075693.pdf' });
assert(originalClassification.type.id === 'bol', 'unsigned original shipping copy remains BOL');

const genuineOsd = `
OS&D EXCEPTION REPORT
Claim Number: CLM-44019
Load Number: 774400
Damage Description: 12 cases crushed and refused by consignee
Amount Claimed: $875.00
Incident Location: Rogers, MN
`;
const osdClassification = classifyTruckDocumentTextV1040({ text:genuineOsd, fileName:'osd-exception-report.pdf' });
assert(osdClassification.type.id === 'osd_report', 'genuine OS&D report remains classified as OS&D');
const osdFields = sanitizeBolPodFieldsV1041('osd_report', genuineOsd, { total:6399.5 });
assert(osdFields.total === 875, 'genuine claim amount uses explicit claim label');
assert(/crushed/i.test(osdFields.exceptionText), 'genuine damage description is retained');

const ui = fs.readFileSync(path.join(ROOT, 'source/src/modules/scan/SmartDocumentExtraFieldsV1041.jsx'), 'utf8');
assert(!ui.includes('Claim amount'), 'claim form no longer duplicates the generic amount field');
assert(ui.includes('Gross weight') && ui.includes('Signed / delivered'), 'POD review exposes trucking-specific fields');

console.log('PASS — v104.1 signed BOL / POD regression suite');
