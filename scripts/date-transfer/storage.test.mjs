import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {getOwnerOpDb} from '../../lib/local-db/dexie.js';
import {buildRangeArchive,inspectTransfer} from '../../source/src/modules/backup/transferArchive.js';
import {prepareTransferImport,commitTransferImport,recoverTransferProjection} from '../../source/src/modules/backup/transferStorage.js';
import {buildLargeBackup} from '../../source/src/modules/backup/largeBackupV110431.js';
import {hashBlob} from './hash.js';
const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
globalThis.localStorage=storage;globalThis.window=new EventTarget();window.localStorage=storage;Object.defineProperty(navigator,'locks',{value:{request:async(_n,fn)=>fn()}});
const db=getOwnerOpDb();await db.open();const state={activeDriverId:'driver_primary',homeTerminalTimeZone:'America/Chicago',currentStatus:'OFF',eventsByDay:{'2026-10-04':[{id:'e',status:'SB',startMin:0,endMin:1440}],'2026-10-12':[{id:'out',status:'D',startMin:0,endMin:60}]},signatureByDay:{'2026-10-04':{signed:true,signatureDataUrl:'data:image/png;base64,AQID'}},certifyStatus:{'2026-10-04':'Certified'}};
const pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save(),blob=new Blob([bytes],{type:'application/pdf'}),sha=await hashBlob(blob);const business={loads:[{id:'tql',loadNo:'38622645',bolNumber:'81657654',pickupDate:'2026-10-03',deliveryDate:'2026-10-08'}],documents:[]};
const doc={local_id:'d',client_document_id:'c',load_no:'38622645',document_date:'2026-10-13',mime_type:'application/pdf',type:'pod',original_file_name:'pod.pdf',sha256:sha};
await db.documents_local.add(doc);await db.document_blobs.add({local_blob_id:'b',client_document_id:'c',blob});
const progress=[];const exported=await buildRangeArchive({db,state,businessStore:business,from:'2026-10-04',to:'2026-10-11',onProgress:s=>progress.push(s)});
assert(exported.file.name.endsWith('.zip'));const checked=await inspectTransfer(exported.file);assert.deepEqual(Object.keys(checked.data.state.eventsByDay),['2026-10-04']);assert.equal(checked.data.dexie.documents_local.length,1);assert.equal(await hashBlob(checked.data.dexie.document_blobs[0].blob),sha);assert.equal(checked.data.transferMetadata.fileHashes.length>0,true);
// Missing binary is repaired without metadata duplication; repeated import is inert.
await db.document_blobs.clear();let current={...state,eventsByDay:{},signatureByDay:{},certifyStatus:{}};storage.setItem('owner-op-road-ready-business-v1',JSON.stringify(business));
let review=await prepareTransferImport(checked,current,{db,storage});assert.equal(review.docs.blobs.length,1);let result=await commitTransferImport(review,{db,storage,getState:()=>current});current=result.state;assert.equal(await db.documents_local.count(),1);assert.equal(await db.document_blobs.count(),1);assert.deepEqual(current.signatureByDay,state.signatureByDay);assert.equal((await PDFDocument.load(await (await db.document_blobs.get('transfer-blob-c')).blob.arrayBuffer())).getPageCount(),1);
review=await prepareTransferImport(checked,current,{db,storage});result=await commitTransferImport(review,{db,storage,getState:()=>current});assert.equal(result.summary.documentsImported,0);assert.equal(await db.document_blobs.count(),1);assert.equal(result.summary.conflicts,0);
// Changed signed event remains untouched and both versions are durable review evidence.
const conflict={...checked,data:{...checked.data,state:{...checked.data.state,eventsByDay:{'2026-10-04':[{id:'e',status:'D',startMin:5,endMin:100}]}}}};
review=await prepareTransferImport(conflict,current,{db,storage});result=await commitTransferImport(review,{db,storage,getState:()=>current});assert.deepEqual(result.state.eventsByDay,current.eventsByDay);assert(result.summary.conflicts>0);assert((await db.sync_meta.toArray()).some(r=>r.key.startsWith('transfer-review-')));
// Transaction abort rolls back blobs, snapshots and document metadata together.
await db.document_blobs.clear();const before=await db.app_snapshots.toArray();review=await prepareTransferImport(checked,current,{db,storage});await assert.rejects(()=>commitTransferImport(review,{db,storage,getState:()=>current,injectFailure:()=>{throw Error('synthetic interruption');}}),/synthetic interruption/);assert.equal(await db.document_blobs.count(),0);assert.deepEqual(await db.app_snapshots.toArray(),before);
// Projection failure is recoverable after the database transaction commits.
review=await prepareTransferImport(checked,current,{db,storage});let fail=true;const quota={...storage,setItem:(k,v)=>{if(fail)throw Error('synthetic quota');storage.setItem(k,v);}};result=await commitTransferImport(review,{db,storage:quota,getState:()=>current});assert.equal(result.projectionPending,true);fail=false;assert(await recoverTransferProjection({db,storage:quota}));assert.equal((await db.sync_meta.get('road-ready-smart-import-journal-v1')).value.status,'applied');
// Full backup ZIP follows the same safe merge path. No destructive restore.
const full=await buildLargeBackup({db,state,businessStore:business,localRows:[]});const fullChecked=await inspectTransfer(full.file);assert.equal(fullChecked.kind,'complete backup');
review=await prepareTransferImport(fullChecked,current,{db,storage});result=await commitTransferImport(review,{db,storage,getState:()=>current});assert.deepEqual(result.state.eventsByDay['2026-10-12'],state.eventsByDay['2026-10-12']);
const week=await inspectTransfer(new File([JSON.stringify({kind:'owner_op_road_ready_cycle_week_export',state:checked.data.state})],'week.json'));assert(week.data.state.eventsByDay['2026-10-04']);
const single=await inspectTransfer(new File([JSON.stringify({kind:'owner_op_road_ready_day_backup',sourceDay:'2026-10-04',dayData:{events:state.eventsByDay['2026-10-04'],signature:state.signatureByDay['2026-10-04']}})],'day.json'));assert.deepEqual(single.data.state.signatureByDay,state.signatureByDay);

// Duplicate original with different source IDs remaps every document relationship.
const aliased=structuredClone(checked);aliased.data.dexie.documents_local[0].local_id='source-d';aliased.data.dexie.documents_local[0].client_document_id='source-c';aliased.data.dexie.document_blobs[0].client_document_id='source-c';aliased.data.state.documentsByDay={'2026-10-04':[{id:'doc-ref',clientDocumentId:'source-c',localDocumentId:'source-d'}]};
review=await prepareTransferImport(aliased,current,{db,storage});assert.equal(review.docs.aliases.get('source-c'),'c');assert.equal(review.merge.state.documentsByDay['2026-10-04'][0].clientDocumentId,'c');assert.equal(review.merge.state.documentsByDay['2026-10-04'][0].localDocumentId,'d');
review=await prepareTransferImport(checked,current,{db,storage});await assert.rejects(()=>commitTransferImport(review,{db,storage,getState:()=>({...current,currentStatus:'SB'})}),/Records changed after preview/);
const broken=new File([exported.file.slice(0,150),new Uint8Array([255]),exported.file.slice(151)],'broken.zip');await assert.rejects(()=>inspectTransfer(broken));
await assert.rejects(()=>inspectTransfer(new File([JSON.stringify({kind:'audit_report',logbook:[]})],'audit.json')),/audit report/);
console.log('PASS — real Dexie/date ZIP roundtrip; readable PDF original restored once; signed log preservation; repeated import; HOS conflict review; atomic rollback; interrupted projection recovery; full backup recognition; damaged ZIP/audit rejection');
await db.delete();
