import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {applyFactsToDocument,mirrorFacts} from '../../source/src/modules/owneros/evidenceStorageV110413.js';
import {uniqueDocuments} from '../../source/src/modules/owneros/evidenceCoreV110413.js';
import {reconcileLoadFoldersV10974} from '../../source/src/modules/owneros/loadFolderReconciliationV10974.js';
import {stageReviewedPodPromotion,podRecordSnapshot,acknowledgeReceiverSignature} from '../../lib/documents/podSupersessionV1.js';
import {verifyPendingPodCheckpoint} from '../../lib/documents/podCheckpointV1.js';
import {originalPageCount} from '../../lib/documents/podSupersessionRuntimeV1.js';
import {PDFDocument} from 'pdf-lib';
const read=p=>fs.readFileSync(p,'utf8'),bytes=new TextEncoder().encode('synthetic original').buffer;
const hashBytes=async value=>createHash('sha256').update(Buffer.from(value)).digest('hex'),sha=await hashBytes(bytes);
function fixture(){
 const bol={local_id:'local-one',client_document_id:'doc-one',type:'bol',load_no:'LOAD-100',sha256:sha,file_size_bytes:bytes.byteLength,page_count:1,mime_type:'image/jpeg',extracted:{type:'bol',loadNo:'LOAD-100',date:'2026-10-14'}};
 const doc=stageReviewedPodPromotion(bol,acknowledgeReceiverSignature(applyFactsToDocument(bol,'pod',{loadNo:'LOAD-100',date:'2026-10-14',podSigned:true,reference:'BOL-100'}),true));
 const records={ [JSON.stringify(['table','documents_local',doc.local_id])]:structuredClone(doc), [JSON.stringify(['table','document_blobs','blob-one'])]:{client_document_id:'doc-one',blob:{__rrAccountFile:1,kind:'Blob',size:bytes.byteLength,mime:'image/jpeg',chunks:[{sha256:sha,bytes:bytes.byteLength}]}} };
 return {bol,doc,records};
}
test('materialized manual review preserves source and primary projections until verified',async()=>{
 const {bol,doc,records}=fixture(),store={documents:[]};mirrorFacts(store,doc);
 assert.equal(doc.podLifecycleV1.state,'pending_sync');assert.equal(store.documents[0].podLifecycleV1.state,'pending_sync');assert.equal(store.documents[0].page_count,1);
 const display=uniqueDocuments([doc,...store.documents]);assert.equal(display.length,1);assert.equal(display[0].type,'bol');
 const plan=await verifyPendingPodCheckpoint({document:doc,ownerId:'owner-one',revision:2,records,hashBytes,readFile:async()=>new Blob([bytes])});
 assert.equal(plan.eligible,true);assert.equal(uniqueDocuments(plan.records)[0].type,'pod');assert.equal(plan.previousVersion.sha256,bol.sha256);
 const folders=reconcileLoadFoldersV10974({loads:[{loadNo:'LOAD-100'}],documents:plan.records});
 assert.equal(folders.allDocuments.length,1);assert.equal(folders.folders.flatMap(folder=>folder.pods).filter(Boolean).length,1);
});
test('page counts come from actual file structure, not inferred OCR',async()=>{
 assert.equal(await originalPageCount(new Blob([bytes],{type:'image/jpeg'})),1);
 assert.equal(await originalPageCount(new Blob([bytes],{type:'application/pdf'})),0);
 const pdf=await PDFDocument.create();pdf.addPage();pdf.addPage();
 assert.equal(await originalPageCount(new Blob([await pdf.save()],{type:'application/pdf'})),2);
});
test('materialized save and full archive hooks are installed after active writer guard',()=>{
 const storage=read('source/src/modules/owneros/evidenceStorageV110413.js'),sync=read('lib/owner-op-cloud/accountSyncV110455.js');
 assert.ok(storage.includes('stageReviewedPodPromotion(originalForReview,acknowledgeReceiverSignature(applyFactsToDocument'));
 assert.ok(storage.includes('await originalPageCount(original)'));
 assert.ok(sync.includes("if(scope==='all')await finalizePendingPodPromotions({uid,revision,check})"));
 assert.ok(sync.indexOf('writer.generation')<sync.indexOf('finalizePendingPodPromotions({uid'));
 assert.ok(sync.includes('await assertActiveDevice('));
});
function runtimeHarness({readError=false,mutate=false,reread=false,account='owner-one'}={}){
 const f=fixture();let row=f.doc,writes=0,reads=0,checks=0;
 const db={documents_local:{toArray:async()=>[row],get:async()=>row,put:async value=>{row=value;writes++;}},transaction:async(mode,table,fn)=>fn()};
 const query={select:()=>query,eq:()=>query,single:async()=>({data:{revision:2,payload:{records:f.records}}})};
 const cloud={from:()=>query,storage:{from:()=>({download(){throw Error('Unexpected direct download');}})}};
 const raw=read('scripts/reader-foundation/podSupersessionRuntime.js');
 const source=raw.slice(raw.indexOf('export async function finalizePendingPodPromotions')).replace('export async function','async function');
 const context={getOwnerOpDb:()=>db,cloudClient:()=>cloud,cloudSession:async()=>({user:{id:account}}),bounded:async p=>p,
  verifyPendingPodCheckpoint,podRecordSnapshot,hashBytes,readFile:async()=>{reads++;if(readError)throw Error('offline');if(mutate)row={...row,load_no:'CHANGED'};if(reread)row={...row,title:'Latest title',extracted:{...row.extracted,readerAnalysisV1:{version:1,revision:9},readerReviewV110345:{remaining:0,latest:true},driverNote:'Keep current note'}};return new Blob([bytes]);},
  BUSINESS_STORE_KEY:'business',BUSINESS_STORE_EVENT:'business-event',localStorage:{getItem:()=>null,setItem:()=>{}},window:{dispatchEvent:()=>{}},CustomEvent:class {}};
 const run=vm.runInNewContext(source+';finalizePendingPodPromotions',context);
 return {run:()=>run({uid:'owner-one',revision:2,check:async()=>{checks++;}}),get:()=>({row,writes,reads,checks})};
}
test('runtime finalization checks owner and writes metadata only after verified cloud read',async()=>{
 const harness=runtimeHarness(),result=await harness.run(),state=harness.get();
 assert.equal(result.promoted,1);assert.equal(state.writes,1);assert.equal(state.reads,1);assert.ok(state.checks>=3);assert.equal(state.row.podLifecycleV1.state,'primary');
});
test('interrupted cloud read leaves BOL pending with no local writes',async()=>{
 const harness=runtimeHarness({readError:true}),result=await harness.run(),state=harness.get();
 assert.equal(result.promoted,0);assert.equal(state.writes,0);assert.equal(state.row.podLifecycleV1.state,'pending_sync');assert.equal(result.errors.length,1);
});
test('changed candidate during readback fails compare-and-swap without overwrite',async()=>{
 const harness=runtimeHarness({mutate:true}),result=await harness.run(),state=harness.get();
 assert.equal(result.promoted,0);assert.equal(state.writes,0);assert.equal(state.row.load_no,'CHANGED');
});
test('account change prevents local promotion',async()=>{
 const harness=runtimeHarness({account:'owner-two'}),result=await harness.run();assert.equal(result.promoted,0);assert.equal(harness.get().writes,0);
});
test('prior BOL history is reachable without re-reading or uploading old content',()=>{
 const files=read('source/src/modules/owneros/SavedDocumentFilesV110344.jsx');
 assert.ok(files.includes('Open previous BOL record'));assert.ok(files.includes('document={doc.podLifecycleV1.previousVersions[0]} historyMode'));
 assert.ok(files.includes("!historyMode&&(current.pdf || current.file.type.startsWith('image/'))"));
 const code=read('lib/documents/podSupersessionRuntimeV1.js');assert.ok(!/\.upload\(|\.delete\(|\.remove\(/.test(code));
});
test('real type-change UI clears inherited signature values and passes only fresh confirmation',()=>{
 const center=read('source/src/modules/owneros/EvidenceCenterV110413.jsx'),storage=read('source/src/modules/owneros/evidenceStorageV110413.js');
 assert.ok(center.includes("setReceiverConfirmed(false);if(e.target.value==='pod')setFields(value=>({...value,podSigned:false}))"));
 assert.ok(center.includes("if(name==='podSigned')setReceiverConfirmed(v===true)"));
 assert.ok(center.includes('receiverSignatureConfirmed:receiverConfirmed'));assert.ok(storage.includes('receiverSignatureConfirmed=false'));
 assert.ok(center.includes('A pickup or driver signature does not count.'));
 const {bol}=fixture(),inherited=applyFactsToDocument(bol,'pod',{loadNo:'LOAD-100',podSigned:true});
 const result=stageReviewedPodPromotion(bol,inherited);assert.equal(result.podLifecycleV1.state,'review_required');
 assert.equal(uniqueDocuments([result])[0].type,'bol');
});

test('cloud verification preserves a concurrent source reread and unrelated metadata',async()=>{
 const harness=runtimeHarness({reread:true}),result=await harness.run(),state=harness.get();
 assert.equal(result.promoted,1);assert.equal(state.row.podLifecycleV1.state,'primary');
 assert.equal(state.row.extracted.readerAnalysisV1.revision,9);assert.equal(state.row.extracted.readerReviewV110345.latest,true);
 assert.equal(state.row.extracted.driverNote,'Keep current note');assert.equal(state.row.title,'Latest title');
});
