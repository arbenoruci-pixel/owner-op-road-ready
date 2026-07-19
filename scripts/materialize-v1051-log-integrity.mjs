import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '105.1.0';
const RELEASED_AT = '2026-07-19T06:45:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v105.1 missing ${label}`);
  return content.replace(before, after);
}

// Canonical Load identity may never silently become a BOL/PO. Invalid OCR
// guides also stay outside active-load matching.
const foundationPath = 'source/src/modules/documents/documentFoundationV105.js';
let foundation = read(foundationPath);
foundation = replaceOnce(
  foundation,
  "export function isValidCanonicalLoadNoV105(value = '') {",
  `function safeSecondaryReferenceV1051(value = '', canonical = '') {
  const normalized = normalizeReferenceV105(value);
  const canonicalNormalized = normalizeReferenceV105(canonical);
  if (!normalized || normalized === canonicalNormalized || isDateLikeReferenceV105(value)) return '';
  return normalized;
}

export function isValidCanonicalLoadNoV105(value = '') {`,
  'safe secondary Load reference',
);
foundation = replaceOnce(
  foundation,
  "  if (!loadNo || HIDDEN_STATUS_V105.test(textV105(guide.status))) return null;",
  "  if (!loadNo || guide.excludedFromActiveLoad === true || textV105(guide.reviewStatus).toLowerCase() === 'needs_review' || HIDDEN_STATUS_V105.test(textV105(guide.status))) return null;",
  'invalid guide candidate exclusion',
);
foundation = replaceOnce(
  foundation,
  "    bol:normalizeCanonicalLoadNoV105(pickup?.bol || leg?.bol) || canonical,\n    po:normalizeReferenceV105(pickup?.po || leg?.po || ''),",
  "    bol:safeSecondaryReferenceV1051(pickup?.bol || leg?.bol || '', canonical),\n    po:safeSecondaryReferenceV1051(pickup?.po || leg?.po || '', canonical),",
  'active-load BOL and PO separation',
);
foundation = replaceOnce(
  foundation,
  "    stopCount:guide && !guideHasInvalidStopsV105(guide) ? Number(guide.stopCount || guide.stops?.length || 0) : (leg ? 1 : 0),\n    deliveryCount:guide && !guideHasInvalidStopsV105(guide) ? Number(guide.deliveryCount || (guide.stops || []).filter(stop => stop?.type === 'delivery').length || 0) : (leg ? 1 : 0),",
  "    stopCount:guide && !guideHasInvalidStopsV105(guide) ? Number(guide.stopCount || guide.stops?.length || 0) : (leg && textV105(leg.toCity) && !isDateLikePlaceV105(leg.toCity) ? 1 : 0),\n    deliveryCount:guide && !guideHasInvalidStopsV105(guide) ? Number(guide.deliveryCount || (guide.stops || []).filter(stop => stop?.type === 'delivery').length || 0) : (leg && textV105(leg.toCity) && !isDateLikePlaceV105(leg.toCity) ? 1 : 0),",
  'unknown destination count',
);
write(foundationPath, foundation);

// Run the log repair last so earlier route/document compatibility materializers
// cannot reintroduce stale Load, BOL, PO or transition metadata.
const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
app = replaceOnce(
  app,
  "import { applyVaultDocumentCommitV105, repairRoadReadyFoundationV105, ROAD_READY_DOCUMENT_COMMIT_EVENT_V105 } from '../modules/documents/documentFoundationV105.js';",
  "import { applyVaultDocumentCommitV105, repairRoadReadyFoundationV105, ROAD_READY_DOCUMENT_COMMIT_EVENT_V105 } from '../modules/documents/documentFoundationV105.js';\nimport { repairLogIntegrityV1051 } from '../modules/logbook/logIntegrityV1051.js';",
  'App log-integrity import',
);
app = replaceOnce(
  app,
  "  return reconcileCertificationStatusesV1032(repairRoadReadyFoundationV105(repairMultiStopProgressStateV1043(repairMultiStopDeliveryStateV1034(inspectionNormalized, { source:'normalize_v1034' }), { source:'normalize_v1043' }), { source:'normalize_v105' }));",
  "  return repairLogIntegrityV1051(reconcileCertificationStatusesV1032(repairRoadReadyFoundationV105(repairMultiStopProgressStateV1043(repairMultiStopDeliveryStateV1034(inspectionNormalized, { source:'normalize_v1034' }), { source:'normalize_v1043' }), { source:'normalize_v105' })), { source:'normalize_v1051' });",
  'state normalization log repair',
);
app = app.replaceAll(
  "return markRecert(repairRoadReadyFoundationV105(repairMultiStopProgressStateV1043(repairMultiStopDeliveryStateV1034(next, { source:'state_write_v1034' }), { source:'state_write_v1043' }), { source:'state_write_v105' }));",
  "return markRecert(repairLogIntegrityV1051(repairRoadReadyFoundationV105(repairMultiStopProgressStateV1043(repairMultiStopDeliveryStateV1034(next, { source:'state_write_v1034' }), { source:'state_write_v1043' }), { source:'state_write_v105' }), { source:'state_write_v1051' }));",
);
app = app.replaceAll(
  "setState(current => repairRoadReadyFoundationV105(applyVaultDocumentCommitV105(current, payload), { source:'document_commit_v105' }));",
  "setState(current => repairLogIntegrityV1051(repairRoadReadyFoundationV105(applyVaultDocumentCommitV105(current, payload), { source:'document_commit_v105' }), { source:'document_commit_v1051' }));",
);
write(appPath, app);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) {
  lock.packages[''].version = VERSION;
  lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
}
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v105.1-log-integrity-first',
  releasedAt:RELEASED_AT,
  notes:[
    'Repairs corrupted Load, BOL, PO, document-link and pickup/delivery transition metadata without changing duty-status time or duty status.',
    'Keeps Load 391912 stops aligned: intermediate stops remain stop completions, Rice is the final delivery, and Load 98306 no longer contaminates St. Cloud.',
    'Removes completed Load 391912 and invalid BOL/date fields from the Jul 18 Mount Sterling Pre-trip while preserving the real Pre-trip event.',
    'Quarantines Date-as-destination OCR routes, separates Load number from BOL/PO, and keeps valid pickups visible for review.',
    'Repairs OFF-duty midnight continuity and missing state text from proven adjacent log events.',
    'Signed days changed by metadata repair remain Needs Recertification for the driver; originals and signed GPS evidence are preserved.'
  ],
  label:'v105.1 Log Integrity First',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

for (const [relative, marker] of [
  ['source/src/modules/logbook/logIntegrityV1051.js','repairLogIntegrityV1051'],
  [foundationPath,'safeSecondaryReferenceV1051'],
  [appPath,'normalize_v1051'],
  [appPath,'state_write_v1051'],
  ['public/app-version.json','105.1.0'],
]) {
  if (!read(relative).includes(marker)) throw new Error(`v105.1 verification missing ${marker} in ${relative}`);
}

console.log('v105.1 Log Integrity First materialized');
await import('./verify-log-integrity-v1051.mjs');
await import('./materialize-v1052-gate-pass.mjs');
