import fs from 'node:fs';
import assert from 'node:assert/strict';

const VERSION='110.2.9';
const BUILD='v110209-ratecon-one-way';
function read(path){return fs.readFileSync(path,'utf8');}
function write(path,value){fs.mkdirSync(path.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(path,value);}
function once(source,before,after,label){
  if(source.includes(after) && !source.includes(before)) return source;
  const count=source.split(before).length-1;
  assert.equal(count,1,`110.2.9 anchor changed: ${label}; found ${count}`);
  return source.replace(before,after);
}
function replaceAllChecked(source,before,after,min,label){
  const count=source.split(before).length-1;
  assert.ok(count>=min,`110.2.9 anchor changed: ${label}; found ${count}`);
  return source.split(before).join(after);
}

// One authority boundary for load identity. Operational event IDs, route IDs and
// Home group keys are never valid load numbers. A Rate Con-backed guide or
// business load is the only entity allowed to establish a canonical load.
write('source/src/modules/loads/rateConAuthorityV11029.js', String.raw`export const RATECON_AUTHORITY_VERSION_V11029 = '110.2.9';

function text(value = '') { return String(value ?? '').trim(); }
function documentType(document = {}) {
  return text(document?.type?.id || document?.typeId || document?.documentType || document?.kind || document?.type).toLowerCase();
}

export function isInternalOperationalIdV11029(value = '') {
  const raw = text(value).toUpperCase();
  return /^(?:LIVE|LEG|EVENT|ROUTE|STATUS|ACTIVE[-_ ]?LOAD|LOAD)[_-]/.test(raw)
    || /^(?:PICKUP|DELIVERY)[_-](?:EVENT|LEG)[_-]/.test(raw);
}

export function canonicalRateConLoadNoV11029(value = '') {
  const raw = text(value).toUpperCase()
    .replace(/^(?:LOAD|ORDER|TRIP|SHIPMENT|CONFIRMATION)\s*(?:NUMBER|NO\.?|#)?\s*[:#-]*/i, '')
    .replace(/^[^A-Z0-9]+|[^A-Z0-9._/-]+$/g, '');
  if (!raw || isInternalOperationalIdV11029(raw)) return '';
  if (!/\d/.test(raw) || raw.length < 3 || raw.length > 32) return '';
  if (/^(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}$/.test(raw)) return '';
  return raw;
}

export function rateConBackedGuideV11029(guide = {}) {
  const loadNo = canonicalRateConLoadNoV11029(guide.loadNo || guide.orderNo);
  const source = text(guide.source || guide.sourceType || guide.createdBy).toLowerCase();
  return Boolean(loadNo && /rate[_ -]?confirmation/.test(source));
}

export function rateConBackedBusinessLoadV11029(load = {}, documents = []) {
  const loadNo = canonicalRateConLoadNoV11029(load.canonicalLoadNo || load.loadNo || load.orderNo);
  if (!loadNo) return false;
  const source = text(load.source || load.createdBy || load.originSource).toLowerCase();
  if (/rate[_ -]?confirmation/.test(source)) return true;
  const documentId = text(load.rateConfirmationDocumentId || load.documentId || load.sourceDocumentId);
  if (!documentId) return false;
  const document = (documents || []).find(item => text(item?.id || item?.local_id) === documentId);
  return Boolean(document && documentType(document) === 'rate_confirmation');
}
`);

// Rate Confirmation reader 1.2 is the scanner-facing Rate Con authority. It
// wraps the frozen 1.1 evidence engine and adds identity hygiene. Classification
// may still succeed without a load number, but saving remains review-blocked.
write('source/src/modules/document-readers/rate-confirmation/RateConfirmationReaderV11029.js', String.raw`import { analyzeRateConfirmationV11 } from '../../scan/engines/rateConfirmationEngineV11.js';
import { engineResultV1 } from '../../scan/engines/documentEngineContractV1.js';
import { canonicalRateConLoadNoV11029 } from '../../loads/rateConAuthorityV11029.js';

export const RATE_CONFIRMATION_READER_V11029 = Object.freeze({
  id:'rate-confirmation-reader',
  typeId:'rate_confirmation',
  version:'1.2.0',
  locked:true,
  supersedes:'1.1.0',
  authority:'canonical-load-identity',
});

export function analyzeRateConfirmationV11029(input = {}) {
  const base = analyzeRateConfirmationV11(input);
  const loadNo = canonicalRateConLoadNoV11029(base.fields?.loadNo || base.fields?.orderNo || input.fields?.loadNo || input.fields?.orderNo);
  const orderNo = canonicalRateConLoadNoV11029(base.fields?.orderNo || loadNo) || loadNo;
  const missing = new Set(base.missingFields || []);
  if (!loadNo) missing.add('loadNo'); else missing.delete('loadNo');
  return engineResultV1({
    engineId:RATE_CONFIRMATION_READER_V11029.id,
    version:RATE_CONFIRMATION_READER_V11029.version,
    typeId:RATE_CONFIRMATION_READER_V11029.typeId,
    qualified:base.qualified,
    score:base.score,
    confidence:base.confidence,
    groups:base.groups,
    penalties:base.penalties,
    fields:{ ...base.fields, loadNo, orderNo },
    missingFields:[...missing],
    reasons:[...(base.reasons || []), loadNo
      ? 'Rate Con 1.2 accepted a canonical document load identity.'
      : 'Rate Con 1.2 requires driver review because no canonical document load identity was verified.'],
  });
}
`);

// Scanner routes Rate Confirmation through the dedicated reader module.
{
  const path='source/src/modules/scan/engines/documentEngineRegistryV10959.js';
  let source=read(path);
  source=once(source,
    "import { RATE_CONFIRMATION_ENGINE_V11 } from './rateConfirmationEngineV11.js';",
    "import { RATE_CONFIRMATION_READER_V11029 } from '../../document-readers/rate-confirmation/RateConfirmationReaderV11029.js';",
    'registry Rate Con import');
  source=once(source,"registryVersion:'109.6.1'","registryVersion:'110.2.9'",'registry version');
  source=once(source,'rate_confirmation:RATE_CONFIRMATION_ENGINE_V11','rate_confirmation:RATE_CONFIRMATION_READER_V11029','registry active Rate Con');
  write(path,source);
}
{
  const path='source/src/modules/scan/engines/isolatedDocumentRouterV10959.js';
  let source=read(path);
  source=once(source,
    "import { analyzeRateConfirmationV11 } from './rateConfirmationEngineV11.js';",
    "import { analyzeRateConfirmationV11029 } from '../../document-readers/rate-confirmation/RateConfirmationReaderV11029.js';",
    'router Rate Con import');
  source=once(source,'rate_confirmation:analyzeRateConfirmationV11','rate_confirmation:analyzeRateConfirmationV11029','router Rate Con runner');
  write(path,source);
}

// Home no longer guesses an Active Load from route-leg keys, loadInfo or live
// Logbook event IDs. Only the canonical Rate Con-backed guide may drive Home.
{
  const path='source/src/modules/home/HomeScreen.jsx';
  let source=read(path);
  source=replaceAllChecked(source,
    'activeGuideLoadSummaryV105(state, businessStore) || activeLoadSummary(state, businessStore)',
    'activeGuideLoadSummaryV105(state, businessStore)',2,'Home legacy active-load fallback');
  source=source.replaceAll('App v110.2.8','App v'+VERSION);
  write(path,source);
}

// Active-load summary itself fails closed unless the guide was created from a
// Rate Confirmation and its load identity is canonical.
{
  const path='source/src/modules/loads/activeLoadSummaryV105.js';
  let source=read(path);
  const importLine="import { guideClosedOrMalformedV10958, shouldSuppressActiveLoadCommandV10958 } from './completedLoadCloseoutV10958.js';";
  source=once(source,importLine,importLine+"\nimport { canonicalRateConLoadNoV11029, rateConBackedGuideV11029 } from './rateConAuthorityV11029.js';",'active summary authority import');
  source=once(source,
    "  const guide = guideId ? state.loadGuidesById?.[guideId] : null;\n  if (!guide || terminalStatus(guide.status) || guideClosedOrMalformedV10958(guide)) return null;",
    "  const guide = guideId ? state.loadGuidesById?.[guideId] : null;\n  const canonicalLoadNoV11029 = canonicalRateConLoadNoV11029(guide?.loadNo || guide?.orderNo);\n  if (!guide || !canonicalLoadNoV11029 || !rateConBackedGuideV11029(guide) || terminalStatus(guide.status) || guideClosedOrMalformedV10958(guide)) return null;",
    'active summary guide guard');
  source=once(source,
    "    loadNo:text(guide.loadNo || guide.orderNo || state.loadInfo?.loadNo),",
    "    loadNo:canonicalLoadNoV11029,",
    'active summary canonical load');
  write(path,source);
}

// BOL/POD may attach to an existing Rate Con guide; they can never discover or
// activate a legacy/log-derived guide. This is a one-way document relationship.
{
  const path='source/src/modules/loads/loadGuideV103.js';
  let source=read(path);
  const first="import { guideClosedOrMalformedV10958, guideHasMissionStepsV10958, repairCompletedLoadCommandV10958 } from './completedLoadCloseoutV10958.js';";
  source=once(source,first,first+"\nimport { rateConBackedGuideV11029 } from './rateConAuthorityV11029.js';",'load guide authority import');
  source=once(source,
    "  return Object.values(state.loadGuidesById || {}).find(guide => guideReferenceValues(guide).some(value => refs.includes(value))) || null;",
    "  return Object.values(state.loadGuidesById || {}).find(guide => rateConBackedGuideV11029(guide) && guideReferenceValues(guide).some(value => refs.includes(value))) || null;",
    'matching guide authority');
  source=once(source,
    "    if (!candidate || candidate.status !== 'active' || candidate.excludedFromActiveLoad) return false;",
    "    if (!candidate || !rateConBackedGuideV11029(candidate) || candidate.status !== 'active' || candidate.excludedFromActiveLoad) return false;",
    'get active guide authority');
  write(path,source);
}

// Candidate discovery is one-way: Rate Con guide/business records establish a
// load. Route legs and loadInfo can only enrich an already established load.
{
  const path='source/src/modules/documents/documentFoundationV105.js';
  let source=read(path);
  source="import { rateConBackedBusinessLoadV11029, rateConBackedGuideV11029 } from '../loads/rateConAuthorityV11029.js';\n"+source;
  source=once(source,
`  for (const guide of Object.values(state.loadGuidesById || {})) add(candidateFromGuideV105(guide, state));
  for (const { day, leg } of routeEntriesV105(state)) add(candidateFromLegV105(leg, state, day));
  for (const load of businessStore.loads || []) add(candidateFromBusinessLoadV105(load));`,
`  for (const guide of Object.values(state.loadGuidesById || {})) {
    if (rateConBackedGuideV11029(guide)) add(candidateFromGuideV105(guide, state));
  }
  for (const load of businessStore.loads || []) {
    const candidate = candidateFromBusinessLoadV105(load);
    if (candidate && (rateConBackedBusinessLoadV11029(load, businessStore.documents || []) || byLoad.has(candidate.loadNo))) add(candidate);
  }
  for (const { day, leg } of routeEntriesV105(state)) {
    const candidate = candidateFromLegV105(leg, state, day);
    if (candidate && byLoad.has(candidate.loadNo)) add(candidate);
  }`,
    'candidate authority ordering');
  source=once(source,'  if (infoLoadNo) {','  if (infoLoadNo && byLoad.has(infoLoadNo)) {','loadInfo enrichment only');
  write(path,source);
}

// A Rate Con creates its own identity from the document (or an explicit driver
// choice). It never adopts an unrelated active/matched load. File names are not
// accepted as load identity evidence.
{
  const path='source/src/modules/scan/SmartScanSheetV105.jsx';
  let source=read(path);
  source=once(source,
    "import { chooseRateConLoadNoV10964, compactIntelligenceV10964, compactRateConAnalysisV10964, compactRateConSaveFieldsV10964, extractRateConLoadNoFromFileV10964, savedViewModelV10964 } from './rateConSaveStabilityV10964.js';",
    "import { chooseRateConLoadNoV10964, compactIntelligenceV10964, compactRateConAnalysisV10964, compactRateConSaveFieldsV10964, savedViewModelV10964 } from './rateConSaveStabilityV10964.js';",
    'remove filename identity import');
  source=once(source,
`    const loadNo = chooseRateConLoadNoV10964({
      typeId,
      preferredLoadNo,
      extractedLoadNo:rateConNewLoad,
      match:nextMatch,
    });`,
`    const loadNo = typeId === 'rate_confirmation'
      ? normalizeCanonicalLoadNoV105(rateConNewLoad || preferredLoadNo)
      : chooseRateConLoadNoV10964({
          typeId,
          preferredLoadNo,
          extractedLoadNo:rateConNewLoad,
          match:nextMatch,
        });`,
    'Rate Con cannot adopt matcher identity');
  source=once(source,
`      const rateConFileNameV10964 = nextFile.name || scanMeta?.originalFileName || scanMeta?.fileName || '';
      const inferredLoadNoV10964 = result?.type?.id === 'rate_confirmation' && !primaryLoadReference(result)
        ? extractRateConLoadNoFromFileV10964(rateConFileNameV10964)
        : '';
      const resultWithIdentityV10964 = inferredLoadNoV10964
        ? { ...result, fields:{ ...(result.fields || {}), loadNo:inferredLoadNoV10964, orderNo:result.fields?.orderNo || inferredLoadNoV10964 } }
        : result;
      applyResult({ ...resultWithIdentityV10964, scanMeta:{ ...(scanMeta || {}), originalFileName:rateConFileNameV10964 } });`,
`      const rateConFileNameV10964 = nextFile.name || scanMeta?.originalFileName || scanMeta?.fileName || '';
      applyResult({ ...result, scanMeta:{ ...(scanMeta || {}), originalFileName:rateConFileNameV10964 } });`,
    'remove Rate Con filename identity fallback');
  write(path,source);
}

// Release identity. No forced reload: existing service worker will activate the
// new build normally while preserving IndexedDB/log data.
for (const path of ['release-version.json','public/app-version.json']) {
  if (!fs.existsSync(path)) continue;
  const meta=JSON.parse(read(path));
  meta.version=VERSION;
  meta.build=BUILD;
  meta.releasedAt=new Date().toISOString();
  meta.updatedAt=meta.releasedAt;
  meta.label='Rate Con one-way authority';
  meta.force=false;
  meta.notes=[
    'Active Load is created only from a confirmed Rate Confirmation-backed guide.',
    'Logbook event IDs, route-leg keys and loadInfo cannot become load numbers or create load candidates.',
    'Rate Con Reader 1.2 owns document load identity; filename and active-load matcher fallbacks are disabled.',
  ];
  meta.sourceCommit=process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || meta.sourceCommit || null;
  write(path,JSON.stringify(meta,null,2)+'\n');
}
for (const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
  let source=read(path);
  source=source.replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`)
    .replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`);
  write(path,source);
}

console.log('PASS — 110.2.9 Rate Con one-way authority finalized; Logbook editor/graph/HOS untouched');
