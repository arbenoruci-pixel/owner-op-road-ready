'use client';
// TEST HARNESS ONLY. Copy manually to app/reader-ui-test/page.jsx in an isolated
// runtime; never install this route or deploy it. It uses a fresh browser profile.
import React,{useEffect,useState} from 'react';
import SmartScanSheet from '../../source/src/modules/scan/SmartScanSheetV105.jsx';
import LoadAttachmentSheet from '../../source/src/modules/scan/LoadAttachmentSheetV110426.jsx';
import EvidenceWorkspace from '../../source/src/modules/owneros/EvidenceWorkspaceV110453.jsx';
import LoadFolders from '../../source/src/modules/owneros/LoadFoldersV10969.jsx';
import {readBusinessStore,writeBusinessStore} from '../../source/src/modules/business/businessStore.js';
import {getOwnerOpDb} from '../../lib/local-db/dexie.js';
import {readOriginalRow,sha256Original} from '../../source/src/modules/scan/originalStore.js';
import {resolveCaptureOriginal} from '../../source/src/modules/scan/captureOriginals.js';
import {reconcileLoadFoldersV10974} from '../../source/src/modules/owneros/loadFolderReconciliationV10974.js';
import {documentWeeks} from '../../source/src/modules/owneros/documentWeeksV110416.js';
const state={eventsByDay:{},documentsByDay:{},fuelReceiptsByDay:{},routeLegsByDay:{},signatureByDay:{},inspectionByDay:{},logMetaByDay:{},certifyStatus:{},teamDrivers:[],activeLoadGuideId:'',loadGuides:[],today:'2026-10-19',selectedDate:'2026-10-19'};
const guide={id:'SYNTHETIC-CROSS-GUIDE',loadNo:'CROSS-TEST-71',broker:'EXAMPLE BROKER',origin:'Albany, NY',destination:'Madison, WI',pickupDate:'2026-10-09',deliveryDate:'2026-10-13',deliveredDate:'2026-10-13',status:'delivered',stops:[{id:'pickup',type:'pickup',date:'2026-10-09',city:'Albany',state:'NY'},{id:'delivery',type:'delivery',date:'2026-10-13',city:'Madison',state:'WI'}]};
export default function ReaderUITest(){
 const [ready,setReady]=useState(false),[mode,setMode]=useState('home'),[file,setFile]=useState(null),[context,setContext]=useState(null),[docs,setDocs]=useState([]),[business,setBusiness]=useState({loads:[],documents:[]}),[revision,setRevision]=useState(0);
 async function refresh(){const rows=await getOwnerOpDb().documents_local.toArray();setDocs(rows);setBusiness(readBusinessStore());}
 useEffect(()=>{let active=true;(async()=>{const db=getOwnerOpDb();await db.open();if(!(await db.documents_local.count())&&!readBusinessStore().loads.length)writeBusinessStore({loads:[guide],documents:[]},{preserveEvidence:true});await refresh();if(active)setReady(true);})();
   const changed=()=>refresh();window.addEventListener('owner-op-business-updated',changed);window.addEventListener('road-ready-evidence-filed',changed);
   window.__readerUITest={read:async()=>{const db=getOwnerOpDb(),documents=await db.documents_local.toArray(),blobRows=await db.document_blobs.toArray(),captureRows=await db.capture_asset_blobs.toArray(),store=readBusinessStore();const model=reconcileLoadFoldersV10974({loads:store.loads,documents,state,businessStore:store});return {documents,store,blobs:blobRows.map(({blob,...row})=>({...row,size:blob?.size||0})),captures:await Promise.all(captureRows.map(async({blob,...row})=>({...row,physicalSize:blob?.size||0,resolvedSha256:(await resolveCaptureOriginal(db,{...row,...(blob?{blob}:{})})).sha256}))),physicalHashes:await Promise.all([...blobRows,...captureRows].filter(row=>row.blob?.size).map(row=>sha256Original(row.blob))),hashes:await Promise.all(documents.map(async doc=>({id:doc.local_id,sha256:await sha256Original((await readOriginalRow(db,doc.client_document_id)).blob)}))),weeks:documentWeeks(model.folders,model.archiveState,{...model.evidenceStore,documents:model.allDocuments}).map(week=>({start:week.start,loads:week.items.map(load=>({id:load.id,loadNo:load.loadNo}))})),state};}};
   return()=>{active=false;window.removeEventListener('owner-op-business-updated',changed);window.removeEventListener('road-ready-evidence-filed',changed);delete window.__readerUITest;};
 },[]);
 async function close(){setMode('home');setFile(null);setContext(null);setRevision(value=>value+1);await refresh();}
 function scan(next){setContext(next);setFile(null);setMode('reader');setRevision(value=>value+1);}
 if(!ready)return <p>Preparing isolated Reader fixture…</p>;
 return <main><aside style={{padding:12,background:'#ffefbf',color:'#201a08'}}>SYNTHETIC TEST DATA · local browser profile · no live account<details><summary>Test controls</summary><button onClick={close}>Test home</button><button onClick={()=>{setContext(null);setMode('reader');setFile(null);setRevision(value=>value+1);}}>Test Reader</button><button onClick={()=>{setMode('attachment');setRevision(value=>value+1);}}>Test Add POD</button><button onClick={()=>scan({kind:'pod',loadNo:guide.loadNo,stopSequence:1,date:'2026-10-12'})}>Test fixed Add POD Reader</button><button onClick={()=>{refresh();setMode('documents');}}>Test Documents</button></details></aside>
  {mode==='home'?<section><h1>Reader integration test</h1><button onClick={()=>setMode('reader')}>Open Reader</button></section>:null}
  {mode==='reader'?<><label>Test original<input aria-label="Test original" type="file" accept="application/pdf,image/*" onChange={event=>{setFile(event.target.files?.[0]||null);setRevision(value=>value+1);}}/></label><SmartScanSheet key={revision} state={state} profile={{name:'SYNTHETIC DRIVER',company:'EXAMPLE CARRIER'}} initialFileV110312={file} evidenceContextV110413={context} initialPreferredType={context?.kind||'auto'} onClose={close} onOpenBusiness={()=>{refresh();setMode('documents');}}/></>:null}
  {mode==='attachment'?<LoadAttachmentSheet key={revision} state={state} context={{guideId:guide.id,loadNo:guide.loadNo,type:'pod',broker:guide.broker,stop:guide.stops[1],stopSequence:1,isFinalStop:true}} onClose={close}/>:null}
  {mode==='documents'?<EvidenceWorkspace state={state} documents={docs} localDocuments={docs} onBack={close} onScan={scan} loadsView={<LoadFolders loads={business.loads} documents={docs} state={state} businessStore={business} onScan={scan}/>}/>:null}
 </main>;
}
