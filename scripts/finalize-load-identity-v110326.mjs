import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = file => fs.readFileSync(file, 'utf8');
function patch(file, before, after) {
  const source = read(file);
  if (source.includes(after)) return;
  assert.equal(source.split(before).length - 1, 1, `Load identity anchor: ${file}`);
  fs.writeFileSync(file, source.replace(before, after));
}
function addImport(file, statement) {
  if (!read(file).includes(statement)) fs.writeFileSync(file, statement + '\n' + read(file));
}
const loads = 'source/src/modules/loads/';
fs.copyFileSync('scripts/v110326/loadIdentity.js', loads + 'loadIdentityV110326.js');
const guide = loads + 'loadGuideV103.js';
addImport(guide, "import {sameLoadIdentityV110326,scopedLoadInfoV110326} from './loadIdentityV110326.js';");
patch(guide, "  const linked = applySmartDocumentLinkV100(state, payload);",
  "  if ((payload.type?.id || payload.typeId || payload.fields?.type) === 'rate_confirmation') state = {...state, loadInfo:scopedLoadInfoV110326(state.loadInfo, payload.fields)};\n  const linked = applySmartDocumentLinkV100(state, payload);");
patch(guide, 'const previous = Object.values(state.loadGuidesById || {}).find(guide => guideReferenceValues(guide).some(value => payloadReferenceValues(payload).includes(value))) || null;',
  'const previous = Object.values(state.loadGuidesById || {}).find(guide => sameLoadIdentityV110326(guide, fields)) || null;');
patch(guide, "candidate.status !== 'active' || candidate.excludedFromActiveLoad", "candidate.status !== 'active' || candidate.excludedFromActiveLoad || candidate.identityReviewV110326");

const route = 'source/src/core/routes/routeNormalization.js';
addImport(route, "import {scopedLoadInfoV110326} from '../../modules/loads/loadIdentityV110326.js';");
patch(route, "    const docs = firstRealText(latestOpenLoaded.shippingDocs, latestOpenLoaded.loadNo);\n    nextLoad = {",
  "    const docs = firstRealText(latestOpenLoaded.shippingDocs, latestOpenLoaded.loadNo);\n    nextLoad = scopedLoadInfoV110326(nextLoad, {loadNo:docs, broker:latestOpenLoaded.broker});\n    nextLoad = {");
patch(route, "      loadNo:docs || nextLoad.loadNo || '',", "      broker:latestOpenLoaded.broker || nextLoad.broker || '',\n      loadNo:docs || nextLoad.loadNo || '',");

const business = 'source/src/modules/business/businessStore.js';
addImport(business, "import {repairBusinessIdentityV110326} from '../loads/loadIdentityV110326.js';");
patch(business, 'export function normalizeBusinessStore(value = {}) {',
  'export function normalizeBusinessStore(value = {}) { return repairBusinessIdentityV110326(normalizeBusinessStoreBaseV110326(value)); }\nfunction normalizeBusinessStoreBaseV110326(value = {}) {');

const foundation = 'source/src/modules/documents/documentFoundationV105.js';
addImport(foundation, "import {repairBusinessIdentityV110326,candidateIdentityV110326,documentBrokerV110326,assertScanLoadIdentityV110326} from '../loads/loadIdentityV110326.js';");
patch(foundation, 'export function collectLoadCandidatesV105(state = {}, businessStore = {}) {',
  'export function collectLoadCandidatesV105(state = {}, businessStore = {}) {\n  businessStore = repairBusinessIdentityV110326(businessStore);');
patch(foundation, 'const all = [...byLoad.values()].map(candidate => {',
  'const all = [...byLoad.values()].map(candidate => candidateIdentityV110326(candidate,businessStore)).map(candidate => {');
patch(foundation, "guide.excludedFromActiveLoad === true || textV105(guide.reviewStatus)",
  "guide.excludedFromActiveLoad === true || guide.identityReviewV110326 || textV105(guide.reviewStatus)");
patch(foundation, "const brokerIdentityConflict = brokerRelationship === 'conflict';", "const brokerIdentityConflict = candidate.identityReviewV110326 || brokerRelationship === 'conflict';");
patch(foundation, '  const canonicalLoadNo = normalizeCanonicalLoadNoV105(selectedLoadNo || match.loadNo);',
  '  const canonicalLoadNo = normalizeCanonicalLoadNoV105(selectedLoadNo || match.loadNo);\n  assertScanLoadIdentityV110326(typeId,fields,analysis,canonicalLoadNo);');
patch(foundation, 'broker:textV105(match.broker || fields.broker || existing?.broker),',
  'broker:documentBrokerV110326(typeId,fields,analysis,match,existing),');

const recovery = loads + 'savedLoadRecoveryV110312.js';
addImport(recovery, "import {repairBusinessIdentityV110326,repairGuideIdentityV110326,savedDocumentConflictV110326} from './loadIdentityV110326.js';");
patch(recovery, 'export function buildSavedDocumentGuideV110312(record={},store={}) {',
  'export function buildSavedDocumentGuideV110312(record={},store={}) {\n if(savedDocumentConflictV110326(record))return null;');
patch(recovery, '!terminal(guide.status) && !guide.excludedFromActiveLoad',
  '!terminal(guide.status) && !guide.excludedFromActiveLoad && !guide.identityReviewV110326');
patch(recovery, " if(!state||typeof state!=='object')return state;",
  " if(!state||typeof state!=='object')return state;\n store=repairBusinessIdentityV110326(store);\n state=repairGuideIdentityV110326(state,store,buildSavedDocumentGuideV110312);");

const ui = 'source/src/modules/scan/SmartScanSheetV105.jsx';
addImport(ui, "import {assertScanLoadIdentityV110326} from '../loads/loadIdentityV110326.js';");
patch(ui, '      const meta = selectedMeta;',
  '      const meta = selectedMeta;\n      assertScanLoadIdentityV110326(meta.id,analysis?.fields,analysis,selectedLoadNo);');

const VERSION='110.3.26', BUILD='v110326-isolated-load-broker-identity';
for(const file of ['release-version.json','public/app-version.json']) {
  const data=JSON.parse(read(file));
  Object.assign(data,{version:VERSION,build:BUILD,force:false,label:'v110.3.26 Load and broker isolation',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['New loads keep their own broker, rate, equipment and route.','Contract scans use the broker and load number on the source document.','Stored broker corrections require matching source-document evidence.']});
  fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
}
for(const file of ['package.json','package-lock.json']) {
  const data=JSON.parse(read(file));data.version=VERSION;if(data.packages?.[''])data.packages[''].version=VERSION;
  fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
}
for(const [file,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
  let source=read(file);
  for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])source=source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${name}_${key} = '${value}';`);
  fs.writeFileSync(file,source);
}
for(const file of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(file,read(file).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.25');assert.equal(meta.build,'v110325-mission-load-requirements-only');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — load identity isolation and source-backed broker correction installed');
