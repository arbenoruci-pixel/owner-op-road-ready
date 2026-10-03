import assert from 'node:assert/strict';
import fs from 'node:fs';
import {attachmentCaptureMetadata} from './attachmentCapture.js';
import {attachmentContext,saveLoadAttachment} from '../../source/src/modules/scan/attachmentContextV110426.js';
const read=p=>fs.readFileSync(p,'utf8');
const root='source/src/modules/scan/';
const intake=read(root+'AttachmentIntakeV110427.jsx');
const sheet=read(root+'LoadAttachmentSheetV110426.jsx');
const original=new Blob(['original pixels'],{type:'image/jpeg'});
const clean=new Blob(['corrected pixels'],{type:'image/jpeg'});
const meta=attachmentCaptureMetadata({pageCount:2,captureAssets:[{kind:'original',file:original,pageIndex:0},{kind:'display',file:clean,pageIndex:0}],text:'must not be filed',fields:{loadNo:'WRONG'},ocrFile:clean,intakeDraftV110328:{pages:['large draft']}});
assert.equal(meta.captureAssets[0].file,original);assert.equal(meta.captureAssets[1].file,clean);assert.equal(meta.pageCount,2);
for(const key of ['text','fields','ocrFile','intakeDraftV110328'])assert.equal(key in meta,false);
assert.equal(attachmentCaptureMetadata().pageCount,1);
for(const entry of ['CameraAdapterV3','ReviewScreenV3','scannerEngineV3.finalize','photoPagesToPdf','movePage','await onReady?.(','Save \' + documentLabel'])assert.ok(intake.includes(entry),entry);
assert.ok(!/Read document|Read & review|Check the pages before we read/.test(intake));
assert.ok(!/readSmartDocument|runOwnedReader|getTextContent\(|readPdfText\(|readImage|fetch\(/.test(intake));
assert.ok(intake.includes('if(busyRef.current)return;'));
assert.ok(intake.includes('Discard these unsaved pages?'));
assert.ok(intake.includes('accept="application/pdf,.pdf"'));
assert.ok(sheet.includes('const [target] = useState'));
assert.ok(sheet.indexOf('await saveLoadAttachment')<sheet.indexOf('setSaved(true)'));
assert.ok(!/SmartScanSheet|Reader|readDocument/.test(sheet));
const css=read('scripts/v110427/attachment.css');
assert.ok(css.includes('prefers-color-scheme:dark'));assert.ok(css.includes('focus-visible'));assert.ok(css.includes('safe-area-inset-bottom'));assert.ok(css.includes('min-height:54px'));
const guide={id:'guide-A',loadNo:'131791226',stops:[{id:'pickup',type:'pickup'},{id:'delivery',type:'delivery'}]};
const state={activeLoadGuideId:'guide-B',eventsByDay:{'2026-10-02':[{status:'OFF',startMin:0}]}};
const baseline=JSON.stringify(state);
for(const type of ['bol','pod']){
 const context=attachmentContext(guide,{id:type==='pod'?'final_pod':'pickup_bol',documentType:type,stopSequence:1});
 let persisted,storedArgs;
 const dependencies={file:clean,context,date:'2026-10-02',state,
  storage:async args=>{storedArgs=args;return {localDocument:{local_id:'test-'+type}};},
  buildRecord:args=>({...args.fields,canonicalLoadId:args.match.canonicalLoadId}),
  readStore:()=>({documents:[]}),upsertRecord:(store,doc)=>({...store,documents:[doc]}),
  writeStore:async store=>{await new Promise(resolve=>setTimeout(resolve,1));persisted=store;},
 };
 const record=await saveLoadAttachment(dependencies);
 assert.equal(persisted.documents[0],record);assert.equal(record.loadNo,'131791226');assert.equal(record.canonicalLoadId,'guide-A');assert.equal(record.type,type);assert.equal(storedArgs.type,type);assert.equal(storedArgs.file,clean);assert.equal(record.linkToLogbook,false);
 await assert.rejects(saveLoadAttachment({...dependencies,writeStore:async()=>{throw new Error('quota full');}}),/quota full/);
 let wrote=false;
 await assert.rejects(saveLoadAttachment({...dependencies,storage:async()=>{throw new Error('file save failed');},writeStore:()=>{wrote=true;}}),/file save failed/);
 assert.equal(wrote,false);
}
assert.equal(JSON.stringify(state),baseline);
assert.equal(JSON.parse(read('public/app-version.json')).version,'110.4.27');
console.log('PASS — direct scanner contract: photos/PDF, crop/rotate/order, no reader, original assets, captured load/type, awaited persistence, failed-save recovery, unchanged duty data, accessible light/dark controls');
