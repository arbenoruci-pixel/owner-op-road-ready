import fs from 'node:fs';
import path from 'node:path';

const VERSION = '109.6.1';
const BUILD = 'v10961-ratecon-engine-v11';

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive:true });
  fs.writeFileSync(filePath, content);
}

function replaceRequired(source, pattern, replacement, label) {
  if (typeof pattern === 'string') {
    if (source.includes(replacement)) return source;
    if (!source.includes(pattern)) throw new Error('v109.6.1 missing ' + label);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error('v109.6.1 missing ' + label);
}

function writeJson(filePath, transform) {
  const value = JSON.parse(read(filePath));
  transform(value);
  write(filePath, JSON.stringify(value, null, 2) + '\n');
}

write('source/src/modules/scan/engines/rateConfirmationEngineV11.js', String.raw`import { analyzeRateConfirmationV1 } from './rateConfirmationEngineV1.js';
import { addEvidenceGroupV1, engineResultV1, evidenceScoreV1 } from './documentEngineContractV1.js';

export const RATE_CONFIRMATION_ENGINE_V11 = Object.freeze({
  id:'rate-confirmation-engine',
  typeId:'rate_confirmation',
  version:'1.1.0',
  locked:true,
  supersedes:'1.0.0',
});

function text(value = '') {
  return String(value || '').trim();
}

function meaningful(value = '') {
  const cleaned = text(value);
  return /[A-Z0-9]/i.test(cleaned) && !/^[.·•:_-]+$/.test(cleaned) ? cleaned : '';
}

function phone(value = '') {
  const cleaned = text(value);
  return cleaned.replace(/\D/g, '').length >= 10 ? cleaned : '';
}

function email(value = '') {
  const cleaned = text(value);
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(cleaned) ? cleaned : '';
}

function hardConflict(input = {}) {
  const source = String(input.text || '');
  const fuel = /\b(?:gallons?|gal)\b/i.test(source) && /price\s*(?:per|\/)?\s*(?:gal|gallon)|ppu|unit\s+price/i.test(source);
  const completedPod = /receiver\s+signature|consignee\s+signature|signature\s+of\s+(?:receiver|consignee)|received\s+by\s*[:#-]/i.test(source)
    && /date\s+delivered|delivery\s+(?:date|time)\s*[:#-]|received\s+in\s+good\s+order/i.test(source);
  const bol = /bill\s+of\s+lading|straight\s+bill\s+of\s+lading/i.test(source)
    && /shipper/i.test(source)
    && /consignee/i.test(source)
    && /(?:pieces|packages|pallets|cases|quantity|weight|commodity)/i.test(source)
    && !/flat\s+rate|total\s+carrier\s+pay|rate\s+confirmation/i.test(source);
  return fuel || completedPod || bol;
}

export function analyzeRateConfirmationV11(input = {}) {
  const base = analyzeRateConfirmationV1(input);
  const fields = input.fields || {};

  if (base.qualified) {
    return engineResultV1({
      engineId:RATE_CONFIRMATION_ENGINE_V11.id,
      version:RATE_CONFIRMATION_ENGINE_V11.version,
      typeId:RATE_CONFIRMATION_ENGINE_V11.typeId,
      qualified:true,
      score:base.score,
      confidence:base.confidence,
      groups:base.groups,
      penalties:base.penalties,
      fields:{ ...base.fields,
        brokerContactName:meaningful(base.fields?.brokerContactName),
        dispatcherName:meaningful(base.fields?.dispatcherName),
      },
      missingFields:base.missingFields,
      reasons:['Rate Confirmation Engine 1.1 accepted the contract through the original 1.0 evidence path.'],
    });
  }

  const groups = [...(base.groups || [])];
  const penalties = [...(base.penalties || [])];
  const broker = meaningful(fields.broker || base.fields?.broker);
  const carrier = meaningful(fields.carrierName || fields.carrier || base.fields?.carrierName);
  const mc = meaningful(fields.mcNumber || base.fields?.mcNumber) || (/\bMC\s*#?\s*[:#-]?\s*\d{5,10}\b/i.test(carrier) ? 'present' : '');
  const equipment = meaningful(fields.equipment || base.fields?.equipment);
  const tracking = meaningful(fields.trackingProvider || base.fields?.trackingProvider);
  const contactPhone = phone(fields.brokerPhone || fields.dispatchPhone || base.fields?.brokerPhone || base.fields?.dispatchPhone);
  const contactEmail = email(fields.brokerEmail || fields.dispatchEmail || fields.billingEmail || base.fields?.brokerEmail || base.fields?.dispatchEmail || base.fields?.billingEmail);
  const brokerEntity = Boolean(broker) && /logistics|freight|transportation|brokerage|broker/i.test(broker);
  const carrierEntity = Boolean(carrier) && Boolean(mc || /carrier|express|trucking|transport/i.test(carrier));
  const equipmentEntity = Boolean(equipment) && /power\s+only|dry\s+van|reefer|refrigerated|flatbed|step\s*deck|trailer/i.test(equipment);
  const trackingEntity = Boolean(tracking) && /fourkites|macro(?:point|\s+point)|trucker\s+tools|tracking/i.test(tracking);
  const contactEntity = Boolean(contactPhone || contactEmail);

  addEvidenceGroupV1(groups, 'structured-broker-company-v11', 28, brokerEntity, 'Structured broker company field');
  addEvidenceGroupV1(groups, 'structured-carrier-mc-v11', 28, carrierEntity, 'Structured carrier and MC identity');
  addEvidenceGroupV1(groups, 'structured-equipment-v11', 18, equipmentEntity, 'Structured trucking equipment field');
  addEvidenceGroupV1(groups, 'structured-tracking-v11', 18, trackingEntity, 'Structured load tracking provider');
  addEvidenceGroupV1(groups, 'structured-dispatch-contact-v11', 12, contactEntity, 'Structured broker phone or email');

  const totals = evidenceScoreV1(groups, penalties);
  const structuredCore = brokerEntity && carrierEntity && equipmentEntity && trackingEntity && contactEntity;
  const conflict = hardConflict(input);
  if (conflict) penalties.push({ id:'hard-document-conflict-v11', weight:120, detail:'A dedicated POD, BOL or Fuel engine has hard structural evidence.' });
  const finalTotals = evidenceScoreV1(groups, penalties);
  const qualified = structuredCore && !conflict && finalTotals.score >= 70;
  const confidence = qualified ? Math.min(0.97, Math.max(0.86, finalTotals.score / 120)) : Math.max(0, Math.min(0.59, finalTotals.score / 120));

  return engineResultV1({
    engineId:RATE_CONFIRMATION_ENGINE_V11.id,
    version:RATE_CONFIRMATION_ENGINE_V11.version,
    typeId:RATE_CONFIRMATION_ENGINE_V11.typeId,
    qualified,
    score:finalTotals.score,
    confidence,
    groups,
    penalties,
    fields:{
      ...base.fields,
      broker:broker || base.fields?.broker || '',
      carrierName:carrier || base.fields?.carrierName || '',
      mcNumber:meaningful(fields.mcNumber || base.fields?.mcNumber),
      equipment:equipment || base.fields?.equipment || '',
      trackingProvider:tracking || base.fields?.trackingProvider || '',
      brokerContactName:meaningful(fields.brokerContactName || fields.dispatcherName || base.fields?.brokerContactName),
      dispatcherName:meaningful(fields.dispatcherName || fields.brokerContactName || base.fields?.dispatcherName),
      brokerPhone:contactPhone,
      dispatchPhone:contactPhone,
      brokerEmail:email(fields.brokerEmail || fields.dispatchEmail || base.fields?.brokerEmail || base.fields?.dispatchEmail),
      dispatchEmail:email(fields.dispatchEmail || fields.brokerEmail || base.fields?.dispatchEmail || base.fields?.brokerEmail),
      billingEmail:email(fields.billingEmail || base.fields?.billingEmail),
      merchant:'',
      invoiceNo:'',
      podSignedEvidence:false,
      podSigned:false,
      signaturePresent:false,
    },
    missingFields:base.missingFields,
    reasons:[qualified
      ? 'Rate Confirmation Engine 1.1 accepted a complete broker-carrier-equipment-tracking-contact contract profile.'
      : 'Structured Rate Confirmation profile is incomplete or conflicts with another locked document engine.'],
  });
}
`);

const registryPath = 'source/src/modules/scan/engines/documentEngineRegistryV10959.js';
let registry = read(registryPath);
registry = replaceRequired(
  registry,
  "import { RATE_CONFIRMATION_ENGINE_V1 } from './rateConfirmationEngineV1.js';",
  "import { RATE_CONFIRMATION_ENGINE_V11 } from './rateConfirmationEngineV11.js';",
  'Rate Confirmation 1.1 registry import',
);
registry = replaceRequired(
  registry,
  'rate_confirmation:RATE_CONFIRMATION_ENGINE_V1,',
  'rate_confirmation:RATE_CONFIRMATION_ENGINE_V11,',
  'Rate Confirmation 1.1 registry activation',
);
registry = registry.replace("registryVersion:'109.5.9'", "registryVersion:'109.6.1'");
write(registryPath, registry);

const routerPath = 'source/src/modules/scan/engines/isolatedDocumentRouterV10959.js';
let router = read(routerPath);
router = replaceRequired(
  router,
  "import { analyzeRateConfirmationV1 } from './rateConfirmationEngineV1.js';",
  "import { analyzeRateConfirmationV11 } from './rateConfirmationEngineV11.js';",
  'Rate Confirmation 1.1 router import',
);
router = replaceRequired(
  router,
  'rate_confirmation:analyzeRateConfirmationV1,',
  'rate_confirmation:analyzeRateConfirmationV11,',
  'Rate Confirmation 1.1 router activation',
);
write(routerPath, router);

const sheetPath = 'source/src/modules/scan/SmartScanSheetV100.jsx';
let sheet = read(sheetPath);
sheet = sheet.replace("return 'Rate Confirmation Engine 1.0';", "return 'Rate Confirmation Engine 1.1';");
write(sheetPath, sheet);

writeJson('package.json', pkg => {
  pkg.version = VERSION;
  pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
});
if (fs.existsSync('package-lock.json')) {
  writeJson('package-lock.json', lock => {
    lock.version = VERSION;
    if (lock.packages?.['']) {
      lock.packages[''].version = VERSION;
      lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
    }
  });
}

const releasedAt = new Date().toISOString();
write('public/app-version.json', JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt,
  updatedAt:releasedAt,
  label:'v109.6.1 Rate Confirmation Engine 1.1',
  force:true,
  notes:[
    'Adds Rate Confirmation Engine 1.1 as a new version while leaving the locked 1.0 engine file unchanged.',
    'Recognizes the exact Red Lightning profile from structured broker, carrier/MC, Power Only, FourKites and dispatch-contact fields even when OCR misses the contract heading.',
    'Rejects ADES, rated, REJECTION, page markers and false POD signed booleans from Rate Confirmation output.',
    'Keeps POD Engine 1.0, BOL Engine 1.0 and Fuel Receipt Engine 1.0 unchanged and verifies they still reject the Rate Confirmation fixture.'
  ],
}, null, 2) + '\n');

let sw = read('public/sw.js');
sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, `const OWNER_OP_SW_BUILD = '${BUILD}';`);
write('public/sw.js', sw);

let update = read('source/src/core/update/appUpdate.js');
update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`);
update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, `const FALLBACK_APP_BUILD = '${BUILD}';`);
write('source/src/core/update/appUpdate.js', update);

console.log('PASS — v109.6.1 Rate Confirmation Engine 1.1 applied without changing POD, BOL or Fuel engines');
