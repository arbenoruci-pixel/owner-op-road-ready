import fs from 'node:fs';import assert from 'node:assert/strict';
const own='source/src/modules/owneros/',scan='source/src/modules/scan/';
function patch(file,a,b){const s=fs.readFileSync(file,'utf8');if(s.includes(b))return;assert.equal(s.split(a).length,2,'Document flow anchor: '+file+' '+a.slice(0,80));fs.writeFileSync(file,s.replace(a,b));}
fs.copyFileSync('scripts/document-flow/folderRequest.js',own+'folderRequest.js');
fs.copyFileSync('scripts/document-flow/savedOriginal.js',scan+'savedOriginal.js');
const dash='source/src/modules/home/DriverDashboard.jsx';
patch(dash,"'use client';","'use client';\nimport {requestLoadFolder} from '../owneros/folderRequest.js';");
patch(dash,'key={item.key} onClick={onOpenLoads}','key={item.key} onClick={()=>onOpenLoads(item.number)}');
patch(dash,"onOpenLoads={()=>goSection('load_documents')}","onOpenLoads={number=>{requestLoadFolder(number);goSection('load_documents');}}");
patch(own+'EvidenceWorkspaceV110453.jsx',"'use client';","'use client';\nimport {requestLoadFolder} from './folderRequest.js';");
patch(own+'EvidenceWorkspaceV110453.jsx',"onClick={()=>chooseTab('loads')}>Open load folders","onClick={()=>{requestLoadFolder(selected.loadNo||(selected.source?.shipmentReference?'shipment:'+selected.source.shipmentReference:''));chooseTab('loads');}}>Open load folders");
const folder=own+'SmartLoadFolders.jsx';
patch(folder,"'use client';","'use client';\nimport {FOLDER_REQUEST,folderTarget,consumeLoadFolder,resolveFolderTarget} from './folderRequest.js';");
patch(folder,"useState(()=>{try{const value=sessionStorage.getItem('road-ready-open-load-folder')||'';sessionStorage.removeItem('road-ready-open-load-folder');return value;}catch{return '';}})","useState(()=>consumeLoadFolder(typeof sessionStorage==='undefined'?null:sessionStorage))");
patch(folder,"[filter,setFilter]=useState('active')","[filter,setFilter]=useState('all')");
patch(folder,"[advanced,setAdvanced]=useState(false)","[advanced,setAdvanced]=useState(false),[organizeId,setOrganizeId]=useState('')");
patch(folder," useEffect(()=>()=>share?.forEach",` useEffect(()=>{const open=e=>{const id=folderTarget(e.detail);if(!id)return;consumeLoadFolder(sessionStorage);setSelected(id);setFilter('all');setQuery('');setAdvanced(false);setError('');setShare(null);};window.addEventListener(FOLDER_REQUEST,open);return()=>window.removeEventListener(FOLDER_REQUEST,open);},[]);
 useEffect(()=>()=>share?.forEach`);
patch(folder,'<LoadFoldersAdvanced {...props}/>','<LoadFoldersAdvanced {...props} initialOrganizeDocumentId={organizeId}/>');
patch(folder,'{smart.unfiled.slice(0,20).map(d=>fileRow(d))}',`{smart.unfiled.slice(0,20).map(d=><div key={documentIdentity(d)}>{fileRow(d)}<button type="button" className="rr-smart-add" onClick={()=>{setOrganizeId(documentIdentity(d));setAdvanced(true);}}>Choose load for {documentLabel(d)}</button></div>)}`);
patch(folder,"{folder.broker?<p className=\"rr-smart-muted\">{folder.broker}</p>:null}","{folder.broker?<p className=\"rr-smart-muted\">{folder.broker}</p>:null}{folder.source.notes?<p className=\"rr-smart-muted\">{folder.source.notes}</p>:null}");
const adv=own+'LoadFoldersV10969.jsx';
patch(adv,'onContinueBilling,onOpenBackup})','onContinueBilling,onOpenBackup,initialOrganizeDocumentId=\'\'})');
patch(adv,'  function organize(doc){',`  const handledOrganization=useRef('');
  useEffect(()=>{if(!initialOrganizeDocumentId||handledOrganization.current===initialOrganizeDocumentId)return;const matches=allDocuments.filter(d=>[d.client_document_id,d.clientDocumentId,d.local_id,d.localDocumentId,d.id].includes(initialOrganizeDocumentId));if(!matches.length)return;handledOrganization.current=initialOrganizeDocumentId;organize(matches[0]);},[initialOrganizeDocumentId,allDocuments]);
  function organize(doc){`);
const core=own+'smartFolders.js';
patch(core,"addAlias(a.value,id)","addAlias(typeof a==='string'?a:a.value,id)");
patch(core,"for(const stored of list(businessStore.loads)){const id='load:'+ref(stored.loadNo||stored.canonicalLoadNo);if(map.has(id))add(stored);}","for(const stored of list(businessStore.loads))if(!stored.deleted&&!stored.deletedAt&&!/^(deleted|removed|superseded)$/i.test(text(stored.status)))add(stored);");
patch(core,"if(f)f.documents.push(d);else unfiled.push(d);","if(f)f.documents.push(d);else if(['rate_confirmation','bol','pod','delivery_order','load_tender','invoice','packing_list','supporting_packet'].includes(documentType(d)))unfiled.push(d);");
const saved=scan+'savedScanFileV110312.js';
fs.writeFileSync(saved,`import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';\nimport {readTransferOriginal} from '../owneros/transferStorageV110412.js';\nimport {savedOriginalFile} from './savedOriginal.js';\nimport {savedScanResultV110318} from './savedScanResumeV110318.js';\nexport async function savedScanFileV110312(record={}){const db=getOwnerOpDb();if(!db)throw Error('Document storage is unavailable.');return savedOriginalFile(record,{readMetadata:id=>db.documents_local.get(id),readOriginal:readTransferOriginal,resumeResult:savedScanResultV110318});}\n`);
patch(scan+'SmartScanSheetV105.jsx',"createLoadNo={selectedType === 'rate_confirmation' ? primaryLoadReference(analysis) : ''}","createLoadNo={selectedType === 'rate_confirmation' ? primaryLoadReference(sourceAnalysisV110393) : ''}");
const picker=scan+'LoadFolderPicker.jsx';
patch(picker,'  {open?<div',`  {createLoadNo&&createLoadNo!==value&&!candidates.some(item=>item.loadNo===createLoadNo)?<button type="button" className="reader-load-option" onClick={()=>select(createLoadNo)}>Create Load {createLoadNo} from this Ratecon</button>:null}
  {open?<div`);
console.log('PASS document folder targets, direct assignment and account original resume installed');
// Recovery keeps its rollback/snapshot checks. If only the small browser index
// is full, preserve historical recovery copies using the established archive.
patch(own+'recoveryStorageV110413.js',"import {validateTransfer}","import {archiveRecoveryCopies} from './libraryHeadroomV110434.js';\nimport {isQuotaError} from './libraryIndexV110434.js';\nimport {validateTransfer}");
patch(own+'recoveryStorageV110413.js','  const result=await importTransfer(p.transfer,{','  const run=()=>importTransfer(p.transfer,{');
patch(own+'recoveryStorageV110413.js',"  window.dispatchEvent(new Event('road-ready-repair-applied'));",`  let result;
  try{result=await run();}catch(error){
    if(!isQuotaError(error))throw error;
    const released=await archiveRecoveryCopies(getOwnerOpDb(),window.localStorage);
    if(!released)throw error;
    result=await run();
  }
  window.dispatchEvent(new Event('road-ready-repair-applied'));`);
patch(own+'RecoveryPanelV110413.jsx',"import {inspectRecovery", "import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';\nimport {inspectRecovery");
patch(own+'RecoveryPanelV110413.jsx',"[message,setMessage]=useState('');","[message,setMessage]=useState(''),[space,setSpace]=useState('');");
patch(own+'RecoveryPanelV110413.jsx','  const differences=review?.conflicts||[];',`  async function checkSpace(){try{const info=await navigator.storage?.estimate?.();let localBytes=0;for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);localBytes+=2*(key.length+(localStorage.getItem(key)||'').length);}const db=getOwnerOpDb(),rows=db?await db.documents_local.toArray():[];setSpace('Browser storage: '+Math.round((info?.usage||0)/1048576)+' MB used / '+Math.round((info?.quota||0)/1048576)+' MB available quota. Document index: '+Math.round(localBytes/1024)+' KB. '+rows.length+' document records.');}catch(e){setSpace(e.message||'Storage could not be checked.');}}
  const differences=review?.conflicts||[];`);
patch(own+'RecoveryPanelV110413.jsx','    {preview?<section',`    <details><summary>Document storage</summary><button type="button" disabled={busy} onClick={checkSpace}>Check document storage</button>{space?<p role="status">{space}</p>:null}</details>
    {preview?<section`);

patch(own+'recoveryStorageV110413.js','    finalizeDocuments:async({db,rows,next})=>{','    finalizeDocuments:async({db,rows,next})=>{\n      corrected=0;');
patch(folder,'const folder=smart.folders.find(f=>f.id===selected)','const folder=resolveFolderTarget(smart.folders,selected)');
patch(core,"const evidenceScanTypes=new Set(['bol'","const evidenceScanTypes=new Set(['rate_confirmation','bol'");
patch(core,'export function requestedScanFolder(context,type,candidates=[]){',"export function requestedScanFolder(context,type,candidates=[]){\n if(type==='rate_confirmation'&&context?.shipmentReference)return '';\n");
patch(scan+'SmartScanSheetV105.jsx',"import {automaticFolder,automaticPayloadMatches}","import {assertReviewedRateFolder} from '../owneros/folderRequest.js';\nimport {automaticFolder,automaticPayloadMatches}");
patch(scan+'SmartScanSheetV105.jsx','      assertScanLoadIdentityV110326(meta.id,sourceAnalysisV110393?.fields,sourceAnalysisV110393,selectedLoadNo);','      assertReviewedRateFolder(meta.id,sourceAnalysisV110393,selectedLoadNo);\n      assertScanLoadIdentityV110326(meta.id,sourceAnalysisV110393?.fields,sourceAnalysisV110393,selectedLoadNo);');
fs.copyFileSync('scripts/document-flow/acceptedProof.js',own+'acceptedProof.js');
patch(core,'// Read-only folder projection.',"import {acceptedPhotoProof} from './acceptedProof.js';\n// Read-only folder projection.");
patch(core,'  const syncPending=docs.some(d=>originalSyncLabel(d));',`  const alternative=acceptedPhotoProof(folder,kind);
  if(!docs.length&&alternative)return {kind,label:alternative.label,due,sources:[{doc:alternative.doc,pages:alternative.pages}],files:[alternative.doc],status:'saved',detail:alternative.detail};
  const syncPending=docs.some(d=>originalSyncLabel(d));`);
fs.copyFileSync('scripts/document-flow/rateSave.js',scan+'rateSave.js');
patch(scan+'SmartScanSheetV105.jsx',"import {assertReviewedRateFolder}","import {preserveSavedRateDetails} from './rateSave.js';\nimport {assertReviewedRateFolder}");
patch(scan+'SmartScanSheetV105.jsx',"    return upsertBusinessLoadV105(store, {\n      id:record.canonicalLoadId", "    const previous=(store.loads||[]).find(load=>String(load.canonicalLoadNo||load.loadNo||'').trim().toUpperCase()===String(record.canonicalLoadNo).trim().toUpperCase())||{};\n    return upsertBusinessLoadV105(store, preserveSavedRateDetails(previous,{\n      id:record.canonicalLoadId");
patch(scan+'SmartScanSheetV105.jsx',"      source:'rate_confirmation_v105',\n      documentId:record.id,\n    });","      source:'rate_confirmation_v105',\n      documentId:record.id,\n    }));");
const sync='lib/owner-op-cloud/accountSyncV110455.js';
fs.writeFileSync('lib/owner-op-cloud/documentReviewFreshness.js',fs.readFileSync('scripts/document-flow/reviewFreshness.js','utf8').replace("'../../lib/owner-op-cloud/accountCoreV110455.js'","'./accountCoreV110455.js'"));
patch(sync,"import {FORMAT,TABLE_KEYS", "import {documentReviewStillCurrent} from './documentReviewFreshness.js';\nimport {FORMAT,TABLE_KEYS");
patch(sync,'if(choices&&conflictReview&&same(conflictReview.local,local.encoded)&&same(conflictReview.remote,remote?.payload?.records)){','if(choices&&conflictReview&&((same(conflictReview.local,local.encoded)&&same(conflictReview.remote,remote?.payload?.records))||documentReviewStillCurrent(conflictReview,local.encoded,remote?.payload?.records,merge.conflicts,choices))){');

await import('./installSyncDiagnostics.mjs');
await import('./syncDiagnostics.test.mjs');
