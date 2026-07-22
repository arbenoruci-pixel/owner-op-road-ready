import assert from 'node:assert/strict';
import fs from 'node:fs';

import { normalizeEngineInputV1 } from '../source/src/modules/scan/engines/documentEngineContractV1.js';
import { analyzeRateConfirmationV1 } from '../source/src/modules/scan/engines/rateConfirmationEngineV1.js';
import { analyzeRateConfirmationV11, RATE_CONFIRMATION_ENGINE_V11 } from '../source/src/modules/scan/engines/rateConfirmationEngineV11.js';
import { analyzePodV1, POD_ENGINE_V1 } from '../source/src/modules/scan/engines/podEngineV1.js';
import { analyzeBolV1, BOL_ENGINE_V1 } from '../source/src/modules/scan/engines/bolEngineV1.js';
import { analyzeFuelReceiptV1, FUEL_RECEIPT_ENGINE_V1 } from '../source/src/modules/scan/engines/fuelReceiptEngineV1.js';
import { DOCUMENT_ENGINE_REGISTRY_V10959 } from '../source/src/modules/scan/engines/documentEngineRegistryV10959.js';
import { routeIsolatedDocumentV10959 } from '../source/src/modules/scan/engines/isolatedDocumentRouterV10959.js';

function fixture(fields = {}, text = '', fileName = '') {
  return normalizeEngineInputV1(fileName ? { name:fileName, type:'application/pdf' } : null, { text, fields }, {});
}

// Exact extracted-field shape reported on iPhone after the PDF reader missed
// the heading and filename signal. Engine 1.0 scored this two points below its
// threshold. Engine 1.1 owns this structured-contract fallback.
const redLightningNoFilename = fixture({
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
});

const legacy = analyzeRateConfirmationV1(redLightningNoFilename);
const rate = analyzeRateConfirmationV11(redLightningNoFilename);
const pod = analyzePodV1(redLightningNoFilename);
const bol = analyzeBolV1(redLightningNoFilename);
const fuel = analyzeFuelReceiptV1(redLightningNoFilename);
const routed = routeIsolatedDocumentV10959(redLightningNoFilename);

assert.equal(legacy.qualified, false, 'the regression must reproduce the Engine 1.0 field-only miss');
assert.equal(rate.qualified, true, 'Engine 1.1 must recognize the exact Red Lightning structured Rate Confirmation profile without filename help');
assert.equal(rate.version, '1.1.0');
assert.equal(rate.engineId, 'rate-confirmation-engine');
assert.ok(rate.confidence >= 0.86, 'structured Rate Confirmation profile must be high confidence');
assert.equal(routed.winner?.typeId, 'rate_confirmation');
assert.equal(routed.winner?.version, '1.1.0');
assert.equal(pod.qualified, false, 'false POD booleans cannot qualify POD Engine 1.0');
assert.equal(bol.qualified, false, 'Rate Confirmation fields cannot qualify BOL Engine 1.0');
assert.equal(fuel.qualified, false, 'Rate Confirmation fields cannot qualify Fuel Engine 1.0');

assert.equal(rate.fields.loadNo, '', 'ADES must stay rejected');
assert.equal(rate.fields.bolNo, '', 'ADES must stay rejected as BOL number');
assert.equal(rate.fields.poNumber, '', 'rated must stay rejected as PO number');
assert.equal(rate.fields.merchant, '', 'page marker must be removed from merchant');
assert.equal(rate.fields.invoiceNo, '', 'REJECTION must be removed from invoice number');
assert.equal(rate.fields.podSignedEvidence, false, 'Rate Confirmation output cannot retain POD signed evidence');
assert.equal(rate.fields.podSigned, false, 'Rate Confirmation output cannot retain POD signed state');
assert.equal(rate.fields.brokerContactName, '', 'punctuation-only contact name must be blank');
assert.equal(rate.fields.dispatcherName, '', 'punctuation-only dispatcher name must be blank');
assert.equal(rate.fields.broker, 'Red Lightning Logistics, LLC');
assert.equal(rate.fields.equipment, 'Power Only');
assert.equal(rate.fields.trackingProvider, 'FourKites');

const actualContract = fixture({}, `
CARRIER RATE CONFIRMATION
LOAD NO: 97155
Red Lightning Logistics, LLC
NARTA EXPRESS LLC MC # 871792
Equipment: Power Only
Tracking: FourKites required
Pickup: Elgin, IL
Delivery: Woodhaven, MI
Flat Rate: $2,700.00
Broker Signature __________________
Carrier Signature __________________
Please sign and return.
Signed POD and BOL must be submitted for billing.
`);
assert.equal(analyzeRateConfirmationV11(actualContract).qualified, true, 'normal contract-text path must remain recognized');
assert.equal(analyzePodV1(actualContract).qualified, false, 'billing instructions must not become POD');
assert.equal(routeIsolatedDocumentV10959(actualContract).winner?.typeId, 'rate_confirmation');

const realPod = fixture({}, `
PROOF OF DELIVERY
BOL NO: 887766
Consignee: Atlanta Grocery Warehouse
Received in good order
Receiver Signature: John Smith
Date Delivered: 07/22/2026
`);
assert.equal(analyzePodV1(realPod).qualified, true, 'real POD remains POD');
assert.equal(analyzeRateConfirmationV11(realPod).qualified, false, 'Rate Confirmation 1.1 must reject completed POD structure');
assert.equal(routeIsolatedDocumentV10959(realPod).winner?.typeId, 'pod');

const realBol = fixture({}, `
UNIFORM STRAIGHT BILL OF LADING
BOL NO: 556677
Shipper: Midwest Foods
Consignee: East Coast Distribution
Quantity: 10 pallets
Weight: 42,000 lb
Commodity: Packaged food
`);
assert.equal(analyzeBolV1(realBol).qualified, true, 'real BOL remains BOL');
assert.equal(analyzeRateConfirmationV11(realBol).qualified, false, 'Rate Confirmation 1.1 must reject BOL structure');
assert.equal(routeIsolatedDocumentV10959(realBol).winner?.typeId, 'bol');

const realFuel = fixture({}, `
Pilot Flying J
Diesel Fuel Receipt
Gallons: 122.40
Price per gallon: $3.459
Total: $423.38
`);
assert.equal(analyzeFuelReceiptV1(realFuel).qualified, true, 'real fuel receipt remains Fuel');
assert.equal(analyzeRateConfirmationV11(realFuel).qualified, false, 'Rate Confirmation 1.1 must reject fuel structure');
assert.equal(routeIsolatedDocumentV10959(realFuel).winner?.typeId, 'fuel_receipt');

assert.equal(RATE_CONFIRMATION_ENGINE_V11.locked, true);
assert.equal(RATE_CONFIRMATION_ENGINE_V11.supersedes, '1.0.0');
assert.equal(POD_ENGINE_V1.version, '1.0.0', 'POD engine must remain unchanged');
assert.equal(BOL_ENGINE_V1.version, '1.0.0', 'BOL engine must remain unchanged');
assert.equal(FUEL_RECEIPT_ENGINE_V1.version, '1.0.0', 'Fuel engine must remain unchanged');
assert.equal(DOCUMENT_ENGINE_REGISTRY_V10959.registryVersion, '109.6.1');
assert.equal(DOCUMENT_ENGINE_REGISTRY_V10959.active.rate_confirmation.version, '1.1.0');
assert.equal(DOCUMENT_ENGINE_REGISTRY_V10959.active.pod.version, '1.0.0');
assert.equal(DOCUMENT_ENGINE_REGISTRY_V10959.active.bol.version, '1.0.0');
assert.equal(DOCUMENT_ENGINE_REGISTRY_V10959.active.fuel_receipt.version, '1.0.0');

const v1Source = fs.readFileSync('source/src/modules/scan/engines/rateConfirmationEngineV1.js', 'utf8');
const v11Source = fs.readFileSync('source/src/modules/scan/engines/rateConfirmationEngineV11.js', 'utf8');
const podSource = fs.readFileSync('source/src/modules/scan/engines/podEngineV1.js', 'utf8');
const bolSource = fs.readFileSync('source/src/modules/scan/engines/bolEngineV1.js', 'utf8');
const fuelSource = fs.readFileSync('source/src/modules/scan/engines/fuelReceiptEngineV1.js', 'utf8');
const routerSource = fs.readFileSync('source/src/modules/scan/engines/isolatedDocumentRouterV10959.js', 'utf8');
const sheetSource = fs.readFileSync('source/src/modules/scan/SmartScanSheetV100.jsx', 'utf8');
const version = JSON.parse(fs.readFileSync('public/app-version.json', 'utf8'));

assert.ok(v1Source.includes("version:'1.0.0'"), 'locked Rate Confirmation Engine 1.0 source must remain present');
assert.ok(v11Source.includes("version:'1.1.0'"), 'new behavior must live in a new Rate Confirmation engine module');
assert.ok(podSource.includes("version:'1.0.0'"));
assert.ok(bolSource.includes("version:'1.0.0'"));
assert.ok(fuelSource.includes("version:'1.0.0'"));
assert.ok(routerSource.includes("rate_confirmation:analyzeRateConfirmationV11"));
assert.ok(sheetSource.includes('Rate Confirmation Engine 1.1'));
assert.equal(version.version, '109.6.1');
assert.equal(version.build, 'v10961-ratecon-engine-v11');

console.log('PASS — v109.6.1 recognizes the exact field-only Red Lightning Rate Con while POD, BOL and Fuel engines stay frozen at 1.0.0');
