import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyTruckDocumentTextV1040 } from '../source/src/modules/scan/truckDocumentEngineV1040.js';
import { inspectDocumentTemplatesV1042, sanitizeTemplateFieldsV1042 } from '../source/src/modules/scan/truckDocumentTemplateIntelligenceV1042.js';
import { extractPartsReceiptFieldsV11031, scorePartsReceiptStructureV11031 } from '../source/src/modules/scan/partsReceiptV11031.js';

const mk=`M&K TRUCK CENTERS
M&K Truck Centers | Chicago Mack
7900 Bulldog Drive | Summit, IL 60501
DATE ENTERED 08 SEP 26     DATE SHIPPED 08 SEP 26     INVOICE DATE 08 SEP 26
INVOICE NUMBER 1463613
ACCOUNT NO. 98C
SOLD TO CASH IL              SHIP TO CASH
SHIP VIA W/C   SLSM 8910   B/L NO. 998   TERMS CASH   F.O.B. POINT SUMMIT IL
QTY   PART NO.      DESCRIPTION       LIST     NET      AMOUNT
1     85129178      104F03 RELAY      89.92    82.82    82.82
PAID COUNTER
SEP 08 2026
All returned goods subject to 20% handling, restocking charge, must be in original package.
Electrical items & special order parts are non-returnable.
WE WILL NOT ACCEPT RETURNS OF UD PARTS; NO CASH REFUNDS
PARTS 48200 82.82
FREIGHT 6306 0.00
SALES TAX 32400 8.49
TOTAL 20208 $91.31
CUSTOMER COPY`;

const structure=scorePartsReceiptStructureV11031(mk);
assert.equal(structure.strong,true);
assert.ok(structure.score>=200,`expected strong parts structure, got ${structure.score}`);
assert.ok(structure.evidence.includes('part-number column'));
assert.ok(structure.evidence.includes('paid counter'));
console.log('PASS — photographed M&K receipt has independent structural parts-counter evidence');

const auto=classifyTruckDocumentTextV1040({text:mk,fileName:'IMG_0245.jpeg',baseTypeId:'repair_invoice'});
assert.equal(auto.type.id,'parts_receipt',JSON.stringify({type:auto.type.id,score:auto.score,alternatives:auto.alternatives?.slice(0,3)}));
assert.ok(auto.confidence>=.85,`parts receipt confidence too low: ${auto.confidence}`);
console.log('PASS — M&K photo text overrules a wrong Repair Invoice seed and classifies Truck Parts Receipt');

const fields=extractPartsReceiptFieldsV11031(mk,{});
assert.match(fields.merchant,/M&K.*TRUCK CENTERS/i);
assert.equal(fields.invoiceNo,'1463613');
assert.equal(fields.date,'09/08/2026');
assert.equal(fields.total,91.31);
assert.equal(fields.parts,82.82);
assert.equal(fields.salesTax,8.49);
assert.equal(fields.freight,0);
assert.equal(fields.accountNumber,'98C');
assert.equal(fields.paymentMethod,'Cash');
assert.equal(fields.partNumber,'85129178');
assert.match(fields.partDescription,/RELAY/i);
assert.equal(fields.documentSubtype,'parts_counter_receipt');
console.log('PASS — invoice/date/total/tax/part/payment fields are extracted from the photographed layout');

const sanitized=sanitizeTemplateFieldsV1042('parts_receipt',mk,{merchant:'fallback'});
assert.equal(sanitized.total,91.31);
assert.equal(sanitized.invoiceNo,'1463613');
assert.equal(sanitized.partNumber,'85129178');
const templates=inspectDocumentTemplatesV1042({text:mk,fileName:'IMG_0245.jpeg'});
assert.equal(templates[0].typeId,'parts_receipt');
assert.equal(templates[0].strong,true);
console.log('PASS — researched template arbitration also identifies the parts-counter structure');

const ocrVariant=mk.replaceAll('PART NO.','PART N0.').replaceAll('PAID COUNTER','PAID C0UNTER');
assert.equal(classifyTruckDocumentTextV1040({text:ocrVariant,fileName:'camera.jpg'}).type.id,'parts_receipt');
assert.equal(scorePartsReceiptStructureV11031(ocrVariant).strong,true);
console.log('PASS — common OCR O/0 errors in PART NO and PAID COUNTER stay recognizable');

const repair=`MIDWEST TRUCK SERVICE
REPAIR ORDER 77291
INVOICE NUMBER R-77291
VIN 4V4NC9EH0GN123456
ODOMETER 621344
PART NO. DESCRIPTION LIST NET AMOUNT
85129178 RELAY 89.92 82.82 82.82
LABOR TOTAL 240.00
PARTS TOTAL 82.82
WORK PERFORMED: diagnose no-start and replace relay
SERVICE ADVISOR JOHN
INVOICE TOTAL $322.82`;
const repairClass=classifyTruckDocumentTextV1040({text:repair,fileName:'service-invoice.pdf'});
assert.equal(repairClass.type.id,'repair_invoice',JSON.stringify(repairClass.alternatives?.slice(0,3)));
assert.equal(scorePartsReceiptStructureV11031(repair).strong,false);
console.log('PASS — real labor/work-order evidence remains Repair Invoice');

const generic=`ACME SUPPLY
INVOICE NUMBER 12345
PARTS 82.82
TOTAL $91.31`;
assert.notEqual(classifyTruckDocumentTextV1040({text:generic,fileName:'invoice.pdf'}).type.id,'parts_receipt');
assert.equal(scorePartsReceiptStructureV11031(generic).strong,false);
console.log('PASS — generic invoice with the word parts cannot false-positive as a parts-counter receipt');

const rate=`CARRIER RATE CONFIRMATION
LOAD NUMBER 97155
BROKER RED LIGHTNING LOGISTICS
PICKUP ELGIN IL
DELIVERY ELGIN IL
TOTAL CARRIER PAY $1800.00
LINEHAUL $1800.00`;
assert.equal(classifyTruckDocumentTextV1040({text:rate,fileName:'ratecon-97155.pdf'}).type.id,'rate_confirmation');
console.log('PASS — Rate Confirmation authority is unchanged');

const engine=fs.readFileSync('source/src/modules/scan/truckDocumentEngineV1040.js','utf8');
const catalog=fs.readFileSync('source/src/modules/scan/truckDocumentCatalogV1040.js','utf8');
assert.match(engine,/extractPartsReceiptFieldsV11031/);
assert.match(engine,/meta\.id === 'parts_receipt'/);
assert.match(catalog,/paid\\s\+c\[o0\]unter/);
const meta=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
assert.equal(meta.version,'110.3.1');
assert.equal(meta.build,'v110301-parts-receipt-reader');
assert.equal(meta.force,false);
console.log('PASS — final materialized runtime is 110.3.1 and scanner-only integration is installed');
