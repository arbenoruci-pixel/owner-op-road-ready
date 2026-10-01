import assert from 'node:assert/strict';
import {attachmentContext, saveLoadAttachment} from './attachmentContext.js';
const guide={id:'guide_A',loadNo:'69349132',broker:'Echo',stops:[{id:'pu',type:'pickup'},{id:'one',type:'delivery'},{id:'last',type:'delivery'},{id:'return',type:'delivery',role:'trailer_return'}]};
const bol=attachmentContext(guide,{id:'pickup_bol',documentType:'bol'});
const pod=attachmentContext(guide,{id:'final_pod',documentType:'pod',stopSequence:2});
assert.equal(bol.loadNo,'69349132');assert.equal(bol.stop,null);
assert.equal(pod.stop.id,'last');assert.equal(pod.stopSequence,2);assert.equal(pod.isFinalStop,true);
assert.equal(attachmentContext(guide,{documentType:'auto'}),null);
const state={activeLoadGuideId:'guide_B',eventsByDay:{'2026-10-01':[{status:'D',startMin:1}]}};
const original=JSON.stringify(state);let storageArgs, persisted;
const file={name:'unknown-photo.jpeg'};
const record=await saveLoadAttachment({file,context:pod,date:'2026-10-01',state,
 storage:async args=>{storageArgs=args;return {localDocument:{local_id:'doc1'}};},
 buildRecord:args=>({...args.fields, canonicalLoadId:args.match.canonicalLoadId, selectedType:args.type.id}),
 upsertRecord:(store,doc)=>({...store,documents:[doc]}),readStore:()=>({documents:[]}),writeStore:store=>{persisted=store;}});
assert.equal(storageArgs.file,file);assert.equal(storageArgs.type,'pod');
assert.equal(record.loadNo,'69349132');assert.equal(record.canonicalLoadId,'guide_A');assert.equal(record.selectedType,'pod');assert.equal(record.podSigned,true);assert.equal(record.linkToLogbook,false);
assert.equal(persisted.documents[0],record);assert.equal(JSON.stringify(state),original);
await assert.rejects(saveLoadAttachment({file,context:null}),/Open the load/);
let wrote=false;
await assert.rejects(saveLoadAttachment({file,context:bol,storage:async()=>{throw new Error('disk full');},writeStore:()=>{wrote=true;}}),/disk full/);
assert.equal(wrote,false);
console.log('PASS — unknown originals attach to the captured load/type/stop, preserve logs, and fail safely');
