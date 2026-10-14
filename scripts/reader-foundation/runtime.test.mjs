import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createAnalysisProjection,readSavedAnalysis} from '../../packages/smart-reader-core/src/analysisProjection.js';
import {saveLoadAttachment} from '../../source/src/modules/scan/attachmentContextV110426.js';
const read=path=>fs.readFileSync(path,'utf8');
const sheet=read('source/src/modules/scan/SmartScanSheetV105.jsx');
test('actual materialized save retains exact projection after rate compaction and reopen',()=>{
 assert.ok(sheet.includes('storageFieldsV10964.readerAnalysisV1=sourceAnalysisV110393?.fields?.readerAnalysisV1;'));
 assert.ok(sheet.includes('analysisWithProjection(analysis,readerReviewV110345,selectedType,selectedLoadNo,loadSelectionSourceV11037'));
 const snapshot=createAnalysisProjection({selectedType:'bol',selectedLoadNo:'DRIVER-1'});
 const sourceAnalysisV110393={fields:{readerAnalysisV1:snapshot}},storageFieldsV10964={};
 const assignment=sheet.match(/storageFieldsV10964\.readerAnalysisV1=sourceAnalysisV110393\?\.fields\?\.readerAnalysisV1;/)?.[0];
 vm.runInNewContext(assignment,{storageFieldsV10964,sourceAnalysisV110393});
 assert.deepEqual(readSavedAnalysis(JSON.parse(JSON.stringify({extracted:storageFieldsV10964}))),snapshot);
 assert.ok(read('source/src/modules/owneros/SavedReadingReviewV110345.jsx').includes('readSavedAnalysis(doc)'));
});
test('late source review cannot replace explicit type or folder',()=>{
 assert.ok(sheet.includes('typeChosenByDriver.current=Boolean(result.userSelectedTypeV11036)'));
 const block=sheet.match(/const typeId=typeChosenByDriver\.current\?selectedType:filingTypeForReview\(value.summary\)\|\|selectedType;/)?.[0];
 assert.ok(block);
 assert.equal(vm.runInNewContext(block+' typeId',{typeChosenByDriver:{current:true},selectedType:'pod',filingTypeForReview:()=> 'bol',value:{summary:{}}}),'pod');
 assert.ok(sheet.includes("if(!loadSelectionSourceV11037.startsWith('driver_'))"));
});
test('checklist capture saves unchanged bytes and authoritative load without invoking reading',async()=>{
 const file=new Blob(['synthetic original'],{type:'image/jpeg'});let received;
 const record=await saveLoadAttachment({file,context:{guideId:'guide-1',loadNo:'LOAD-1',type:'pod'},date:'2026-10-14',state:{},
 storage:async args=>{received=args;return {localDocument:{local_id:'synthetic'}};},buildRecord:args=>({extracted:args.fields}),upsertRecord:(store,doc)=>({...store,documents:[doc]}),readStore:()=>({}),writeStore:async()=>{}});
 assert.equal(received.file,file);assert.equal(received.type,'pod');assert.equal(record.extracted.loadNo,'LOAD-1');
 const saved=readSavedAnalysis(record);assert.equal(saved.selection.type,'pod');assert.equal(saved.diagnostics.localExtraction.status,'skipped');assert.equal(saved.autoFile,false);
 const intake=read('source/src/modules/scan/AttachmentIntakeV110427.jsx');assert.ok(!/readSmartDocument|runOwnedReader|getTextContent\(|readPdfText\(|readImage|fetch\(/.test(intake));
});
test('single device and explicit save safeguards remain installed',()=>{
 assert.ok(read('lib/owner-op-cloud/accountSyncV110455.js').includes('writer.generation'));
 assert.ok(sheet.includes('if (!canSave || !file) return;'));
 assert.equal(createAnalysisProjection().autoFile,false);
});

test('saved reread replaces prior snapshot atomically and legacy reread cannot be hidden',async()=>{
 const {saveRereading}=await import('../../source/src/modules/owneros/savedRereadingV110347.js');
 const previous=createAnalysisProjection({selectedType:'bol',selectedLoadNo:'KEEP-LOAD'});
 const baseline={local_id:1,client_document_id:'test',sha256:'original-hash',type:'pod',load_no:'KEEP-LOAD',extracted:{readerAnalysisV1:previous,readerReviewV110345:{documents:[]}}};
 let updated;
 const db={documents_local:{where:()=>({equals:()=>({first:async()=>baseline})}),update:async(id,value)=>{updated=value;}},transaction:async(mode,table,run)=>run()};
 const incoming=createAnalysisProjection({selectedType:'bol',selectedLoadNo:'BAD-GUESS'});
 const summary={documents:[{id:'group',fields:{}}],pageCount:1,readerAnalysisV1:incoming};
 const record=await saveRereading(db,baseline,summary);
 assert.equal(updated.extracted.readerAnalysisV1.selection.type,'pod');assert.equal(updated.extracted.readerAnalysisV1.selection.loadNo,'KEEP-LOAD');
 assert.equal(updated.extracted.previousReaderAnalysisV1,previous);assert.equal(record.sha256,baseline.sha256);
 await saveRereading(db,baseline,{documents:summary.documents,pageCount:1});assert.equal(updated.extracted.readerAnalysisV1,undefined);assert.equal(updated.extracted.previousReaderAnalysisV1,previous);
});

test('source loading resolves through the latest callback, not a stale folder closure',async()=>{
 const preview=read('source/src/modules/scan/OwnedReaderPreview.jsx');
 assert.ok(preview.includes('latestCallbacks.current={onReady,onReviewChange}'));
 assert.ok(preview.includes('setSources(files);setResult(next);latestCallbacks.current.onReady?.('));
 let folder='OLD',finish;
 const pending=new Promise(resolve=>{finish=resolve;});
 const latestCallbacks={current:{onReady:()=>{folder='AUTO-OLD';}}};
 const sourceReady=(async()=>{await pending;vm.runInNewContext('latestCallbacks.current.onReady?.(value)',{latestCallbacks,value:{}});})();
 folder='DRIVER-NEW';latestCallbacks.current={onReady:()=>{assert.equal(folder,'DRIVER-NEW');}};finish();await sourceReady;
 assert.equal(folder,'DRIVER-NEW');
});
