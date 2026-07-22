import fs from 'node:fs';

const path = 'source/src/modules/scan/SmartScanSheetV105.jsx';
let source = fs.readFileSync(path, 'utf8');

const before = `import {
  analyzeTruckDocumentV1040,
  documentIntelligencePayloadV1040,
  reanalyzeTruckDocumentTypeV1040,
} from './truckDocumentEngineV1040.js';`;

const after = `import {
  analyzeTruckDocumentIsolatedV10959 as analyzeTruckDocumentV1040,
  documentIntelligencePayloadIsolatedV10959 as documentIntelligencePayloadV1040,
  reanalyzeTruckDocumentTypeIsolatedV10959 as reanalyzeTruckDocumentTypeV1040,
} from './engines/isolatedDocumentRouterV10959.js';`;

if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('v109.6.1 production SmartScanSheetV105 engine import missing');
  source = source.replace(before, after);
}

fs.writeFileSync(path, source);

const enginePath = 'source/src/modules/scan/engines/rateConfirmationEngineV11.js';
let engine = fs.readFileSync(enginePath, 'utf8');
const earlyReturn = `  if (base.qualified) {`;
const structuredReturn = `  const structuredProfileV11 = /logistics|freight|transportation|brokerage|broker/i.test(String(fields.broker || ''))
    && /carrier|express|trucking|transport|MC\\s*#?/i.test(String(fields.carrierName || fields.carrier || ''))
    && /power\\s+only|dry\\s+van|reefer|refrigerated|flatbed|step\\s*deck|trailer/i.test(String(fields.equipment || ''))
    && /fourkites|macro(?:point|\\s+point)|trucker\\s+tools|tracking/i.test(String(fields.trackingProvider || ''))
    && (phone(fields.brokerPhone || fields.dispatchPhone) || email(fields.brokerEmail || fields.dispatchEmail || fields.billingEmail));

  if (base.qualified && !structuredProfileV11) {`;
if (!engine.includes(structuredReturn)) {
  if (!engine.includes(earlyReturn)) throw new Error('v109.6.1 Rate Confirmation 1.1 structured promotion anchor missing');
  engine = engine.replace(earlyReturn, structuredReturn);
}
fs.writeFileSync(enginePath, engine);

console.log('PASS — v109.6.1 production Road Ready OS scanner uses the isolated router and promotes complete structured Rate Con profiles');
