import fs from 'node:fs';import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,before,after){const s=read(p);if(s.includes(after))return;assert.equal(s.split(before).length-1,1,`110.3.12 anchor ${p}: ${before.slice(0,80)}`);fs.writeFileSync(p,s.replace(before,after));}
const loads='source/src/modules/loads/',scan='source/src/modules/scan/';
fs.copyFileSync('scripts/v110312/savedLoadRecoveryV110312.js',loads+'savedLoadRecoveryV110312.js');
fs.copyFileSync('scripts/v110312/savedScanFileV110312.js',scan+'savedScanFileV110312.js');
const app='source/src/app/App.jsx';
patch(app,"import {restoreInstructionGuidesV110311}","import {restoreSavedLoadGuidesV110312,SAVED_LOAD_GUIDE_EVENT_V110312} from '../modules/loads/savedLoadRecoveryV110312.js';\nimport {BUSINESS_STORE_EVENT as GUIDE_STORE_EVENT_V110312} from '../modules/business/businessStore.js';\nimport {restoreInstructionGuidesV110311}");
patch(app,`  React.useEffect(() => {
    if(!offlineHydrated)return;
    setState(current=>runExternalCommand(current,draft=>restoreInstructionGuidesV110311(draft,readGuideStoreV110311()),'documents',{}));
  },[offlineHydrated]);`,`  React.useEffect(() => {
    if(!offlineHydrated)return;
    let timer;
    function restore(event) {
      const preferred=event?.type===SAVED_LOAD_GUIDE_EVENT_V110312?event.detail?.documentId||'':'';
      setState(current=>{
        const store=readGuideStoreV110311();
        if(restoreSavedLoadGuidesV110312(current,store,preferred)===current)return current;
        return runExternalCommand(current,draft=>restoreSavedLoadGuidesV110312(draft,store,preferred),'documents',{});
      });
    }
    const changed=()=>{clearTimeout(timer);timer=setTimeout(restore,350);};
    restore();
    window.addEventListener(GUIDE_STORE_EVENT_V110312,changed);
    window.addEventListener('pageshow',changed);
    window.addEventListener('focus',changed);
    window.addEventListener(SAVED_LOAD_GUIDE_EVENT_V110312,restore);
    return ()=>{clearTimeout(timer);window.removeEventListener(GUIDE_STORE_EVENT_V110312,changed);window.removeEventListener('pageshow',changed);window.removeEventListener('focus',changed);window.removeEventListener(SAVED_LOAD_GUIDE_EVENT_V110312,restore);};
  },[offlineHydrated]);`);
// Keep a document-backed selection through unrelated legacy route normalization.
patch(loads+'instructionAuthorityV110311.js',"if(!instructionGuideBackedV110311(guide)||guide.status!=='active'||guide.excludedFromActiveLoad)return after;", "if(!(instructionGuideBackedV110311(guide)||guide?.savedDocumentGuideV110312&&guide.sourceDocumentId&&/rate_confirmation/.test(guide.source||''))||guide.status!=='active'||guide.excludedFromActiveLoad)return after;");
const sheet=scan+'SmartScanSheetV105.jsx';
patch(sheet,"import {instructionPlanV110311", "import {buildSavedDocumentGuideV110312,finishSavedScanV110312} from '../loads/savedLoadRecoveryV110312.js';\nimport {instructionPlanV110311");
patch(sheet,"onOpenGuide, initialPreferredType = 'auto'", "onOpenGuide, initialFileV110312 = null, resumeDocumentIdV110312 = '', initialPreferredType = 'auto'");
patch(sheet,'  const scanGenerationV11036 = useRef(0);',`  const resumedFileV110312=useRef(null);
  useEffect(()=>{if(initialFileV110312 && resumedFileV110312.current!==initialFileV110312){resumedFileV110312.current=initialFileV110312;chooseFile(initialFileV110312,'auto');}},[initialFileV110312]);
  const scanGenerationV11036 = useRef(0);`);
patch(sheet,'setLinkToLogbook(Boolean(planV110311 && safeSelectedLoadV11034===instructionLoadV110311 && instructionLoadV110311));',"setLinkToLogbook(Boolean((planV110311 && safeSelectedLoadV11034===instructionLoadV110311 && instructionLoadV110311)||(typeId==='rate_confirmation'&&safeSelectedLoadV11034)));");
patch(sheet,'      const analysisForSaveV10964 = compactRateConAnalysisV10964(analysis || {}, storageFieldsV10964);',`      if(meta.id==='rate_confirmation'){
        storageFieldsV10964.guideSourceTextV110312=String(analysis?.text||'').slice(0,16000);
        storageFieldsV10964.guideRisksV110312=(riskReview?.items||[]).map(({id,title,detail})=>({id,title,detail}));
      }
      const analysisForSaveV10964 = compactRateConAnalysisV10964(analysis || {}, storageFieldsV10964);`);
patch(sheet,'      let nextStore = upsertVaultDocumentV105(instructionSaveV110311.store, record, state);',`      if(meta.id==='rate_confirmation')record.loadGuideV110312=buildSavedDocumentGuideV110312(record,currentStore);
      if(record.instructionGuide||record.loadGuideV110312)record.guideActivationRequestedAtV110312=Date.now();
      let nextStore = upsertVaultDocumentV105(instructionSaveV110311.store, record, state);`);
patch(sheet,'if(record.linkToLogbook && !record.instructionGuide)dispatchVaultDocumentCommitV105','if(record.linkToLogbook && !record.instructionGuide && !record.loadGuideV110312)dispatchVaultDocumentCommitV105');
fs.writeFileSync(sheet,read(sheet).replaceAll('finishInstructionScanV110311(saved','finishSavedScanV110312(saved'));
patch(sheet,'Your route, trailer return and requirements are saved.','Your route, stops and requirements are saved.');
patch(scan+'rateConSaveStabilityV10964.js',"instructionGuideId:record.instructionGuide?.id || '',","instructionGuideId:record.instructionGuide?.id || record.loadGuideV110312?.id || '',");
const home='source/src/modules/home/HomeScreen.jsx';
patch(home,"import AdaptiveHomeV1038", "import {pendingSavedLoadScanV110312} from '../loads/savedLoadRecoveryV110312.js';\nimport {savedScanFileV110312} from '../scan/savedScanFileV110312.js';\nimport AdaptiveHomeV1038");
patch(home,"  const [scanOpen, setScanOpen] = useState(false);",`  const [scanOpen, setScanOpen] = useState(false);
  const [savedScanFile,setSavedScanFile]=useState(null);
  const [resumeDocumentId,setResumeDocumentId]=useState('');
  const [savedScanMessage,setSavedScanMessage]=useState('');
  const [savedScanBusy,setSavedScanBusy]=useState(false);
  async function continueSavedScanV110312(record){
    if(!record||savedScanBusy)return;
    setSavedScanBusy(true);setSavedScanMessage('');
    try{const file=await savedScanFileV110312(record);setSavedScanFile(file);setResumeDocumentId(record.localDocumentId||record.id);setScanPreferredType('auto');setScanOpen(true);}
    catch(error){setSavedScanMessage(error.message||'Could not open the saved original.');}
    finally{setSavedScanBusy(false);}
  }`);
patch(home,'        initialPreferredType={scanPreferredType}','        initialPreferredType={scanPreferredType}\n        initialFileV110312={savedScanFile}\n        resumeDocumentIdV110312={resumeDocumentId}');
fs.writeFileSync(home,read(home).replaceAll("setScanOpen(false); setScanPreferredType('auto');", "setScanOpen(false); setSavedScanFile(null); setResumeDocumentId(''); setScanPreferredType('auto');"));
patch(home,'      <AdaptiveHomeV1038','      <AdaptiveHomeV1038\n        savedScan={pendingSavedLoadScanV110312(state,businessStore)}\n        onContinueSavedScan={continueSavedScanV110312}\n        savedScanBusy={savedScanBusy}\n        savedScanMessage={savedScanMessage}');
const adaptive='source/src/modules/home/AdaptiveHomeV1038.jsx';
patch(adaptive,'function NoLoad({ state, summary, business,','function NoLoad({ savedScan, onContinueSavedScan, savedScanBusy, savedScanMessage, state, summary, business,');
patch(adaptive,`        <span>NO ACTIVE LOAD</span><h1>Smart Scan</h1>
        <p>Scan a Rate Con, BOL, POD, receipt or permit. Review the document type and where it will be saved.</p>
        <button type="button" onClick={() => onScan?.('auto')}>Smart Scan</button>`,`        <span>{savedScan?'SAVED SCAN':'NO ACTIVE LOAD'}</span><h1>{savedScan?'Continue your load':'Smart Scan'}</h1>
        <p>{savedScan ? 'Your document is saved. Continue from the original to confirm the load and open its guide.' : 'Scan a Rate Con, BOL, POD, receipt or permit. Review the document type and where it will be saved.'}</p>
        <button type="button" disabled={savedScanBusy} onClick={() => savedScan ? onContinueSavedScan?.(savedScan) : onScan?.('auto')}>{savedScanBusy?'Opening saved original…':savedScan?'Continue saved scan':'Smart Scan'}</button>
        {savedScanMessage?<p role="alert">{savedScanMessage}</p>:null}`);
patch(adaptive,'    state:props.state, summary:props.summary,','    savedScan:props.savedScan,onContinueSavedScan:props.onContinueSavedScan,savedScanBusy:props.savedScanBusy,savedScanMessage:props.savedScanMessage,\n    state:props.state, summary:props.summary,');
patch(sheet,'        metadata:{\n          loadNo:statementV1103?', '        metadata:{\n          resumeDocumentIdV110312,\n          loadNo:statementV1103?');
patch(sheet,'      const record = buildVaultDocumentV105({\n        stored,','      const record = buildVaultDocumentV105({\n        stored,\n        existing:(currentStore.documents||[]).find(d=>d.id===stored.localDocument?.local_id)||null,');
const quota=scan+'quotaSafeScanStorageV10963.js';
patch(quota,'    let existing = await recentDuplicateV10963(db, signature);', '    let existing = (metadata.resumeDocumentIdV110312 ? await db.documents_local.get(metadata.resumeDocumentIdV110312) : null) || await recentDuplicateV10963(db, signature);');
patch(quota,'        ...existing,\n        sha256:originalHashV1103,', '        ...existing,\n        type,family:metadata.family||existing.family,\n        sha256:originalHashV1103,');
patch(quota,'        load_no:metadata.loadNo || existing.load_no || null,', "        load_no:metadata.resumeDocumentIdV110312 ? metadata.loadNo||null : metadata.loadNo||existing.load_no||null,");
const business='source/src/modules/business/businessStore.js';
patch(business,'      extracted:record.extracted?.instructionPlanV110311 ? {instructionPlanV110311:{...record.extracted.instructionPlanV110311,sourceText:""}} : undefined,','      extracted:record.extracted?.instructionPlanV110311 ? {instructionPlanV110311:{...record.extracted.instructionPlanV110311,sourceText:""}} : record.type===\'rate_confirmation\' ? compactExtractedV10963(record.extracted||{}) : undefined,');
patch(business,'createdAt:record.createdAt, updatedAt:record.updatedAt, storageCompacted:true,','createdAt:record.createdAt, updatedAt:record.updatedAt, storageCompacted:true,\n      guideActivationRequestedAtV110312:record.guideActivationRequestedAtV110312,');
const VERSION='110.3.12',BUILD='v110312-saved-scan-recovery';
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.11');assert.equal(meta.build,'v110311-persistent-load-guide');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
for(const p of ['package.json','package-lock.json']){const d=JSON.parse(read(p));d.version=VERSION;if(d.packages?.[''])d.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');}
for(const p of ['release-version.json','public/app-version.json']){const d=JSON.parse(read(p));Object.assign(d,{version:VERSION,build:BUILD,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,force:false,label:'v110.3.12 Saved scan recovery',notes:['Home restores saved guides when selection or app state is missing.','Saved load documents can be continued from their original on the device.','Rate Confirmation guides persist independently of Done.']});fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');}
for(const [p,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']])fs.writeFileSync(p,read(p).replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`));
for(const p of [home,'source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replace(/App v\d+\.\d+\.\d+/g,`App v${VERSION}`).replace(/APP V\d+\.\d+\.\d+/g,`APP V${VERSION}`));
console.log('PASS — saved scan and Home guide recovery 110.3.12 installed');
