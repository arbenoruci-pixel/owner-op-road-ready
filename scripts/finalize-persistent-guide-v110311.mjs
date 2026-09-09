import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,before,after){const s=read(p);if(s.includes(after))return;assert.equal(s.split(before).length-1,1,`110.3.11 anchor ${p}: ${before.slice(0,80)}`);fs.writeFileSync(p,s.replace(before,after));}
const loads='source/src/modules/loads/',scan='source/src/modules/scan/';
for(const name of ['instructionAuthorityV110311.js','instructionPlanV110311.js','instructionGuideV110311.js'])fs.copyFileSync('scripts/v110311/'+name,loads+name);
patch(loads+'rateConAuthorityV11029.js','export const RATECON_AUTHORITY_VERSION',"import {instructionGuideBackedV110311,instructionLoadBackedV110311} from './instructionAuthorityV110311.js';\nexport const RATECON_AUTHORITY_VERSION");
patch(loads+'rateConAuthorityV11029.js','export function rateConBackedGuideV11029(guide = {}) {','export function rateConBackedGuideV11029(guide = {}) {\n  if(instructionGuideBackedV110311(guide))return true;');
patch(loads+'rateConAuthorityV11029.js','export function rateConBackedBusinessLoadV11029(load = {}, documents = []) {','export function rateConBackedBusinessLoadV11029(load = {}, documents = []) {\n  if(instructionLoadBackedV110311(load,documents))return true;');
patch(loads+'loadGuideV103.js','export function applySmartDocumentLinkV103(state = {}, payload = {}) {',"export function applySmartDocumentLinkV103(state = {}, payload = {}) {\n  if((payload.type?.id||payload.typeId)==='load_tender')return applyInstructionGuideV110311(state,payload);");
patch(loads+'loadGuideV103.js',"import { guideClosedOrMalformedV10958", "import {applyInstructionGuideV110311} from './instructionGuideV110311.js';\nimport { guideClosedOrMalformedV10958");
const foundation='source/src/modules/documents/documentFoundationV105.js';
patch(foundation,'export function repairRoadReadyFoundationV105(inputState = {}, options = {}) {','function repairRoadReadyFoundationBaseV110311(inputState = {}, options = {}) {');
if(!read(foundation).includes('import {preserveInstructionSelectionV110311,instructionStopsPendingV110311}'))fs.writeFileSync(foundation,"import {preserveInstructionSelectionV110311,instructionStopsPendingV110311} from '../loads/instructionAuthorityV110311.js';\n"+read(foundation)+"\nexport function repairRoadReadyFoundationV105(state={},options={}) {return preserveInstructionSelectionV110311(state,repairRoadReadyFoundationBaseV110311(state,options));}\n");
patch(foundation,"  if (COMPLETE_STATUS_V105.test(textV105(guide.status))) return true;", "  if (COMPLETE_STATUS_V105.test(textV105(guide.status))) return true;\n  if(instructionStopsPendingV110311(guide))return false;");
const closeout=loads+'completedLoadCloseoutV10958.js';
if(!read(closeout).includes('import {instructionStopsPendingV110311}'))fs.writeFileSync(closeout,"import {instructionStopsPendingV110311} from './instructionAuthorityV110311.js';\n"+read(closeout));
patch(closeout,'  const allRelatedLegsClosed =', '  if(instructionStopsPendingV110311(guide))return false;\n  const allRelatedLegsClosed =');
const app='source/src/app/App.jsx';
patch(app,"import { applyLoadGuideActionV103", "import {restoreInstructionGuidesV110311} from '../modules/loads/instructionGuideV110311.js';\nimport {readBusinessStore as readGuideStoreV110311} from '../modules/business/businessStore.js';\nimport { applyLoadGuideActionV103");
patch(app,'  const [offlineHydrated, setOfflineHydrated] = useState(false);',`  const [offlineHydrated, setOfflineHydrated] = useState(false);
  React.useEffect(() => {
    if(!offlineHydrated)return;
    setState(current=>runExternalCommand(current,draft=>restoreInstructionGuidesV110311(draft,readGuideStoreV110311()),'documents',{}));
  },[offlineHydrated]);`);
const sheet=scan+'SmartScanSheetV105.jsx';
patch(sheet,"import { resolveArchiveDocumentLink }", "import {instructionPlanV110311,instructionFolderV110311} from '../loads/instructionPlanV110311.js';\nimport {persistInstructionGuideV110311,finishInstructionScanV110311} from '../loads/instructionGuideV110311.js';\nimport { resolveArchiveDocumentLink }");
patch(sheet,'  const requiresLoad = loadDocumentType(selectedType);', '  const requiresLoad = loadDocumentType(selectedType);\n  const confirmedInstructionPlanV110311=useMemo(()=>instructionPlanV110311(analysis||{}),[analysis]);');
patch(sheet,"onClose, onOpenBusiness, initialPreferredType", "onClose, onOpenBusiness, onOpenGuide, initialPreferredType");
patch(sheet,"const loadNo = initialScanLoadV11037(result, nextMatch, preferredLoadNo, preserveLoadChoice);", "const planV110311=instructionPlanV110311(result);\n    const instructionLoadV110311=instructionFolderV110311(planV110311,[...collectLoadCandidatesV105(state,businessStore),...(businessStore.loads||[])]);\n    const loadNo = planV110311 && !preserveLoadChoice ? instructionLoadV110311 : initialScanLoadV11037(result, nextMatch, preferredLoadNo, preserveLoadChoice);");
patch(sheet,'setLinkToLogbook(false); // Logbook linking is an explicit driver choice.','setLinkToLogbook(Boolean(planV110311 && safeSelectedLoadV11034===instructionLoadV110311 && instructionLoadV110311));');
patch(sheet,'const storageFieldsV10964 = compactRateConSaveFieldsV10964(mergedFields);',`const instructionPlanForSaveV110311=instructionPlanV110311({...analysis,type:meta});
      const storageFieldsV10964 = compactRateConSaveFieldsV10964(mergedFields);
      if(instructionPlanForSaveV110311 && selectedLoadNo===instructionFolderV110311(instructionPlanForSaveV110311,[...collectLoadCandidatesV105(state,currentStore),...(currentStore.loads||[])])) {
        storageFieldsV10964.instructionPlanV110311=instructionPlanForSaveV110311;
        storageFieldsV10964.stops=instructionPlanForSaveV110311.stops;
      }`);
patch(sheet,'let nextStore = upsertVaultDocumentV105(currentStore, record, state);',`const instructionSaveV110311=persistInstructionGuideV110311(currentStore,record,storageFieldsV10964.instructionPlanV110311);
      let nextStore = upsertVaultDocumentV105(instructionSaveV110311.store, record, state);`);
patch(sheet,'if(record.linkToLogbook)dispatchVaultDocumentCommitV105','if(record.linkToLogbook && !record.instructionGuide)dispatchVaultDocumentCommitV105');
patch(sheet,"onClick={stage === 'saved' ? onClose : reset}","onClick={stage === 'saved' ? () => finishInstructionScanV110311(saved,onClose,onOpenGuide) : reset}");
patch(sheet,"{selectedType === 'rate_confirmation' && primaryLoadReference(analysis)","{(selectedType === 'rate_confirmation' || instructionFolderV110311(confirmedInstructionPlanV110311,[...candidates,...(store.loads||[])])) && primaryLoadReference(analysis)");
patch(sheet,"{selectedLoad?.broker || match?.broker || 'Load folder'}", "{selectedLoad?.broker || (confirmedInstructionPlanV110311?.loadNo===selectedLoadNo ? confirmedInstructionPlanV110311.broker : match?.broker) || 'Load folder'}");
patch(sheet,'<em>DOCUMENT SAVED</em>',"<em>{saved.record.instructionGuideId ? 'DOCUMENT AND GUIDE SAVED' : 'DOCUMENT SAVED'}</em>");
patch(sheet,'<h1>{saved.meta.label}</h1>',`<h1>{saved.meta.label}</h1>
        {saved.record.instructionGuideId ? <p>Your route, trailer return and requirements are saved. Open the guide now, or find it on Home under Full mission.</p> : null}`);
patch(sheet,'<div><button type="button" onClick={reset}>Scan another</button>',`{saved.record.instructionGuideId ? <button type="button" className="scan-save-v105" onClick={()=>finishInstructionScanV110311(saved,onClose,onOpenGuide)}>Done · Open guide</button> : null}
        <div><button type="button" onClick={reset}>Scan another</button>`);
// Ensure every exit after Save delivers the durable guide to the app shell.
patch(sheet,'  function reset() {',`  function reset() {
    if(saved?.record?.instructionGuideId)finishInstructionScanV110311(saved);`);
patch(sheet,'try { onClose?.(); } catch {} window.setTimeout', 'try { finishInstructionScanV110311(saved,onClose); } catch {} window.setTimeout');
patch(scan+'rateConSaveStabilityV10964.js','type:textV10964(stop.type).slice(0, 24),','type:textV10964(stop.type).slice(0, 24),\n    role:textV10964(stop.role).slice(0, 32),');
patch(scan+'rateConSaveStabilityV10964.js',"folder:record.folder || '',","folder:record.folder || '',\n      instructionGuideId:record.instructionGuide?.id || '',");
const home='source/src/modules/home/HomeScreen.jsx';
patch(home,"initialPreferredType={scanPreferredType}","initialPreferredType={scanPreferredType}\n        onOpenGuide={() => { setScanOpen(false); setScanPreferredType('auto'); setBusinessSection(''); setGuideOpen(true); }}");
patch(home,"onOpenScan={() => { setGuideOpen(false); setBusinessSection('loads'); }}", "onOpenScan={type => { setScanPreferredType(type || 'auto'); setScanOpen(true); }}");
patch(loads+'SafeDriverMissionV10966.jsx',"      <section style={{ marginTop:18, borderRadius:28, padding:24, background:'#fff', border:'1px solid #d7e1ee' }}>",`      {guide.instructionsDocumentId ? <section aria-label="Load route and appointments" style={{marginTop:18,borderRadius:24,padding:22,background:'#fff',border:'1px solid #d7e1ee'}}>
        <h2 style={{marginTop:0}}>Route and appointments</h2><p>{guide.broker}</p>
        {(guide.stops||[]).map((stop,index)=><article key={stop.id||index} style={{padding:'14px 0',borderTop:'1px solid #d7e1ee'}}><b>{index+1}. {stop.role==='trailer_return'?'Trailer return':stop.type==='pickup'?'Pickup':'Delivery'} · {stop.company}</b><p>{stop.address}</p><strong>{stop.date} · {stop.appointment||stop.time||'Confirm appointment'}</strong>{stop.pickupNumber||stop.poNumber?<p>Reference: {stop.pickupNumber||stop.poNumber}</p>:null}</article>)}
      </section> : null}
      <section style={{ marginTop:18, borderRadius:28, padding:24, background:'#fff', border:'1px solid #d7e1ee' }}>`);
patch('source/src/modules/business/businessStore.js','extracted:compactExtractedV10963(record.extracted || {}),','extracted:{...compactExtractedV10963(record.extracted || {}),...(record.extracted?.instructionPlanV110311 ? {instructionPlanV110311:record.extracted.instructionPlanV110311} : {})},');
patch('source/src/modules/business/businessStore.js','createdAt:record.createdAt, updatedAt:record.updatedAt, storageCompacted:true,', 'createdAt:record.createdAt, updatedAt:record.updatedAt, storageCompacted:true,\n      extracted:record.extracted?.instructionPlanV110311 ? {instructionPlanV110311:{...record.extracted.instructionPlanV110311,sourceText:\"\"}} : undefined,');
const VERSION='110.3.11',BUILD='v110311-persistent-load-guide';
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.10');assert.equal(meta.build,'v110310-tql-instructions');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
for(const p of ['package.json','package-lock.json']){const d=JSON.parse(read(p));d.version=VERSION;if(d.packages?.[''])d.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');}
for(const p of ['release-version.json','public/app-version.json']){const d=JSON.parse(read(p));Object.assign(d,{version:VERSION,build:BUILD,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,force:false,label:'v110.3.11 Persistent load guide',notes:['Save and Done retain load instructions as a driver guide.','Route, trailer return and requirements remain available on Home.','Verified instructions link to Logbook supporting documents.']});fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');}
for(const [p,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']])fs.writeFileSync(p,read(p).replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`));
for(const p of [home,'source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replace(/App v\d+\.\d+\.\d+/g,`App v${VERSION}`).replace(/APP V\d+\.\d+\.\d+/g,`APP V${VERSION}`));
console.log('PASS — persistent instruction guide 110.3.11 installed');
