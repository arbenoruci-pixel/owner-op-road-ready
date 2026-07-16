import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  billingReadinessV102,
  iftaSummaryV102,
  importFuelCsvV102,
  importMileageCsvV102,
  importTollCsvV102,
  normalizeOwnerOpsStoreV102,
} from '../source/src/modules/owneros/ownerOpsStoreV102.js';
import { receiptOutputSizeV102 } from '../source/src/modules/scan/proDocumentVisionV102.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT,relative),'utf8');

const motiveCsv = `Date,State,Miles,Vehicle Number,Load Number\n07/14/2026,IL,82.4,7005,391912\n07/14/2026,WI,201.2,7005,391912\n07/15/2026,MN,128.6,7005,391912`;
const miles = importMileageCsvV102(motiveCsv,'Motive_IFTA_Q3.csv');
assert.equal(miles.length,3);
assert.equal(miles[0].provider,'Motive / KeepTruckin');
assert.equal(miles[0].loadNo,'391912');

const fuelCsv = `Transaction Date,Merchant,City,State,Gallons,Total,Transaction ID,Vehicle\n07/14/2026,Mudflap New Lisbon,New Lisbon,WI,51.250,198.44,MF-1001,7005\n07/15/2026,Love's,Mounds View,MN,42.000,164.22,MF-1002,7005`;
const fuel = importFuelCsvV102(fuelCsv,'Mudflap_Fuel.csv',{activeLoadNo:'391912'});
assert.equal(fuel.length,2);
assert.equal(fuel[0].loadNo,'391912');
assert.equal(fuel[0].state,'WI');

const tollCsv = `Transaction Date,Toll Plaza,State,Amount,License Plate,Transaction ID\n07/14/2026,Jane Addams I-90,IL,18.40,P12345,IPASS-1\n07/15/2026,Illinois Route 390,IL,7.25,P12345,IPASS-2`;
const tolls = importTollCsvV102(tollCsv,'Illinois_Tollway_IPASS.csv',{activeLoadNo:'391912'});
assert.equal(tolls.length,2);
assert.equal(tolls[0].provider,'Illinois Tollway');
assert.equal(tolls[0].loadNo,'391912');

const ownerStore = normalizeOwnerOpsStoreV102({ mileageImports:miles, fuelImports:fuel, tolls });
const ifta = iftaSummaryV102(ownerStore,{fuel:[]},'2026-Q3');
assert.equal(Math.round(ifta.totalMiles*10)/10,412.2);
assert.equal(ifta.rows.find(row=>row.state==='WI').gallons,51.25);
assert.equal(ifta.missingFuelStates.includes('IL'),true);

const documents = [
  { type:'rate_confirmation', loadNo:'391912' },
  { type:'bol', loadNo:'391912' },
  { type:'pod', loadNo:'391912' },
];
const ready = billingReadinessV102({loadNo:'391912',status:'delivered'},documents,{expenses:[]});
assert.equal(ready.ready,true);
assert.equal(ready.percent,100);
const missingPod = billingReadinessV102({loadNo:'391912',status:'delivered'},documents.slice(0,2),{expenses:[]});
assert.equal(missingPod.ready,false);
assert.equal(missingPod.missing.some(item=>item.id==='pod'),true);

const receiptSize = receiptOutputSizeV102(500,2200);
assert.equal(receiptSize.width>=1000,true);
assert.equal(receiptSize.height>=4000,true);

const home = read('source/src/modules/home/HomeScreen.jsx');
const scanner = read('source/src/modules/scan/documentScannerEngine.js');
const turbo = read('source/src/modules/scan/TurboDocumentScanner.jsx');
const smartTypes = read('source/src/modules/scan/smartScan.js');
const osScreen = read('source/src/modules/owneros/OwnerOperatorOSV102.jsx');
const pdf = read('source/src/modules/owneros/ownerOpsPdfV102.js');
assert.match(home,/OwnerOperatorOSV102/);
assert.match(home,/ActiveLoadLiveV102/);
assert.match(scanner,/detectBestDocumentQuadV102/);
assert.match(scanner,/enhanceOcrCanvasV102/);
assert.match(turbo,/pro-text-v102/);
assert.match(smartTypes,/mileage_statement/);
assert.match(smartTypes,/toll_statement/);
assert.match(osScreen,/Document Vault/);
assert.match(osScreen,/Motive \/ KeepTruckin/);
assert.match(osScreen,/Illinois Tollway \/ E-ZPass/);
assert.match(osScreen,/Generate invoice/);
assert.match(osScreen,/Audit Center/);
assert.match(pdf,/buildBillingPacketPdfV102/);
console.log('verify-owner-operator-os-v102 passed');
