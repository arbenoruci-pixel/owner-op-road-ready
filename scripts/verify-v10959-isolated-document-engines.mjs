import assert from 'node:assert/strict';
import fs from 'node:fs';

import { normalizeEngineInputV1 } from '../source/src/modules/scan/engines/documentEngineContractV1.js';
import { analyzeRateConfirmationV1, RATE_CONFIRMATION_ENGINE_V1 } from '../source/src/modules/scan/engines/rateConfirmationEngineV1.js';
import { analyzePodV1, POD_ENGINE_V1 } from '../source/src/modules/scan/engines/podEngineV1.js';
import { analyzeBolV1, BOL_ENGINE_V1 } from '../source/src/modules/scan/engines/bolEngineV1.js';
import { analyzeFuelReceiptV1, FUEL_RECEIPT_ENGINE_V1 } from '../source/src/modules/scan/engines/fuelReceiptEngineV1.js';
import { DOCUMENT_ENGINE_REGISTRY_V10959 } from '../source/src/modules/scan/engines/documentEngineRegistryV10959.js';
import { routeIsolatedDocumentV10959 } from '../source/src/modules/scan/engines/isolatedDocumentRouterV10959.js';

function input(text, fields = {}, fileName = '') {
  return normalizeEngineInputV1(fileName ? { name:fileName, type:'application/pdf' } : null, { text, fields }, {});
}

const redLightning = input('', {
  merchant:'[[PAGE:1]]',
  invoiceNo:'REJECTION',
  broker:'Red Lightning Logistics, LLC',
  brokerContactName:'.',
  dispatcherName:'.',
  brokerPhone:'(470) 227-7012',
  dispatchPhone:'(470) 227-7012',
  billingEmail:'ricky@redlightninglogistics.com',
  carrierName:'NARTA EXPRESS LLC Phone: 914-413-2229 MC # MC871792',
  equipment:'Power Only',
  trackingProvider:'FourKites',
  documentEvidence:0.25,
  needsFieldReview:true,
  podSignedEvidence:true,
  podSigned:true,
  loadNo:'ADES',
  bolNo:'ADES',
  poNumber:'rated',
}, 'Red-Lightning-Carrier-Confirmation.pdf');

const redRate = analyzeRateConfirmationV1(redLightning);
const redPod = analyzePodV1(redLightning);
const redBol = analyzeBolV1(redLightning);
const redFuel = analyzeFuelReceiptV1(redLightning);
assert.equal(redRate.qualified, true, 'Red Lightning broker/carrier/equipment/tracking evidence must qualify as Rate Confirmation');
assert.equal(redPod.qualified, false, 'POD signed boolean or wording cannot qualify a POD without receiver signature and delivery completion');
assert.equal(redBol.qualified, false, 'Rate Confirmation fields cannot qualify a BOL');
assert.equal(redFuel.qualified, false, 'Rate Confirmation fields cannot qualify a fuel receipt');
assert.equal(redRate.fields.loadNo, '', 'bogus OCR reference ADES must be rejected');
assert.equal(redRate.fields.bolNo, '', 'bogus OCR BOL reference ADES must be rejected');
assert.equal(redRate.fields.poNumber, '', 'word rated must never become a PO number');
assert.equal(redRate.fields.merchant, '', 'page marker must never remain as Rate Confirmation merchant');
assert.equal(redRate.fields.invoiceNo, '', 'REJECTION must never remain as Rate Confirmation invoice number');

const routedRed = routeIsolatedDocumentV10959(redLightning);
assert.equal(routedRed.winner?.typeId, 'rate_confirmation', 'isolated router must select Rate Confirmation for the reported Red Lightning document');
assert.equal(routedRed.winner?.engineId, 'rate-confirmation-engine');

const rateCon = input(`
CARRIER RATE CONFIRMATION
LOAD NO: 424590-1
Red Lightning Logistics, LLC
Broker Signature __________________
Carrier Signature __________________
NARTA EXPRESS LLC MC # 871792
Equipment: Power Only
Tracking: FourKites required
Pickup: Chicago, IL
Delivery: Atlanta, GA
Flat Rate: $2,940.00
Please sign and return this confirmation.
Signed POD and BOL must be submitted for billing.
`, {}, 'carrier-confirmation-ready-to-sign.pdf');
assert.equal(analyzeRateConfirmationV1(rateCon).qualified, true, 'contract heading, rate, route and signatures must qualify Rate Confirmation');
assert.equal(analyzePodV1(rateCon).qualified, false, 'POD mentioned in Rate Confirmation billing instructions must stay negative');
assert.equal(routeIsolatedDocumentV10959(rateCon).winner?.typeId, 'rate_confirmation');

const pod = input(`
PROOF OF DELIVERY
BOL # 887766
Consignee: Atlanta Grocery Warehouse
Received in good order
Receiver Signature: John Smith
Date Delivered: 07/22/2026
`, {}, 'signed-pod-887766.pdf');
assert.equal(analyzePodV1(pod).qualified, true, 'real receiver-signed completed delivery must qualify POD');
assert.equal(analyzeRateConfirmationV1(pod).qualified, false, 'POD cannot qualify Rate Confirmation');
assert.equal(analyzeBolV1(pod).qualified, false, 'signed delivery copy without BOL shipping structure stays POD');
assert.equal(routeIsolatedDocumentV10959(pod).winner?.typeId, 'pod');

const bol = input(`
UNIFORM STRAIGHT BILL OF LADING
BOL NO: 556677
Shipper: Midwest Foods, Chicago, IL
Consignee: East Coast Distribution, Newark, NJ
Carrier Name: Narta Express LLC
Trailer No: 7005
Seal No: 88192
Quantity: 10 pallets
Weight: 42,000 lb
Commodity: Packaged food
`, {}, 'BOL-556677.pdf');
assert.equal(analyzeBolV1(bol).qualified, true, 'shipping parties, freight details and labeled BOL number must qualify BOL');
assert.equal(analyzePodV1(bol).qualified, false, 'unsigned BOL cannot qualify POD');
assert.equal(analyzeRateConfirmationV1(bol).qualified, false, 'BOL cannot qualify Rate Confirmation');
assert.equal(routeIsolatedDocumentV10959(bol).winner?.typeId, 'bol');

const fuel = input(`
Pilot Flying J
Diesel Fuel Receipt
Transaction No: 938281
Date: 07/22/2026
Gary, IN
Pump # 12
Gallons: 122.40
Price per gallon: $3.459
Total: $423.38
`, {}, 'Pilot-fuel-receipt.pdf');
assert.equal(analyzeFuelReceiptV1(fuel).qualified, true, 'merchant, diesel, gallons and price/total must qualify fuel receipt');
assert.equal(analyzeRateConfirmationV1(fuel).qualified, false, 'fuel receipt cannot qualify Rate Confirmation');
assert.equal(analyzePodV1(fuel).qualified, false, 'fuel receipt cannot qualify POD');
assert.equal(analyzeBolV1(fuel).qualified, false, 'fuel receipt cannot qualify BOL');
assert.equal(routeIsolatedDocumentV10959(fuel).winner?.typeId, 'fuel_receipt');

const deterministicA = JSON.stringify(routeIsolatedDocumentV10959(rateCon));
const deterministicB = JSON.stringify(routeIsolatedDocumentV10959(rateCon));
assert.equal(deterministicA, deterministicB, 'same input and engine versions must produce the same result');

assert.equal(DOCUMENT_ENGINE_REGISTRY_V10959.contractVersion, '1.0.0');
for (const engine of [RATE_CONFIRMATION_ENGINE_V1, POD_ENGINE_V1, BOL_ENGINE_V1, FUEL_RECEIPT_ENGINE_V1]) {
  assert.equal(engine.version, '1.0.0', engine.id + ' must stay pinned to version 1.0.0');
  assert.equal(engine.locked, true, engine.id + ' must be locked');
  assert.equal(DOCUMENT_ENGINE_REGISTRY_V10959.active[engine.typeId].id, engine.id);
}

const enginePaths = {
  rate_confirmation:'source/src/modules/scan/engines/rateConfirmationEngineV1.js',
  pod:'source/src/modules/scan/engines/podEngineV1.js',
  bol:'source/src/modules/scan/engines/bolEngineV1.js',
  fuel_receipt:'source/src/modules/scan/engines/fuelReceiptEngineV1.js',
};
for (const [typeId, filePath] of Object.entries(enginePaths)) {
  const source = fs.readFileSync(filePath, 'utf8');
  for (const [otherType, otherPath] of Object.entries(enginePaths)) {
    if (otherType === typeId) continue;
    assert.equal(source.includes('./' + otherPath.split('/').at(-1)), false, typeId + ' engine must not import ' + otherType + ' engine');
  }
}

const sheet = fs.readFileSync('source/src/modules/scan/SmartScanSheetV100.jsx', 'utf8');
const router = fs.readFileSync('source/src/modules/scan/engines/isolatedDocumentRouterV10959.js', 'utf8');
const version = JSON.parse(fs.readFileSync('public/app-version.json', 'utf8'));
assert.ok(sheet.includes("from './engines/isolatedDocumentRouterV10959.js'"), 'production scanner must use isolated engine router');
assert.ok(sheet.includes('Rate Confirmation Engine 1.0'), 'review UI must show the Rate Confirmation engine identity');
assert.ok(router.includes("from '../truckDocumentEngineV1040.js'"), 'generic engine remains a separate fallback and is not rewritten');
assert.ok(router.includes('rate_confirmation:analyzeRateConfirmationV1'));
assert.ok(router.includes('pod:analyzePodV1'));
assert.ok(router.includes('bol:analyzeBolV1'));
assert.ok(router.includes('fuel_receipt:analyzeFuelReceiptV1'));
assert.equal(version.version, '109.5.9');
assert.equal(version.build, 'v10959-isolated-document-engines');

console.log('PASS — v109.5.9 isolated Rate Confirmation, POD, BOL and Fuel engines stay independent and deterministic');
