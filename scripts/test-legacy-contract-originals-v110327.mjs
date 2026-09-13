import assert from 'node:assert/strict';
import {readLegacyContractOriginalsV110327,applyLegacyContractOriginalsV110327} from '../source/src/modules/scan/legacyContractOriginalsV110327.js';
import {collectLoadCandidatesV105} from '../source/src/modules/documents/documentFoundationV105.js';
import {restoreSavedLoadGuidesV110312} from '../source/src/modules/loads/savedLoadRecoveryV110312.js';
import {savedScanResultV110318} from '../source/src/modules/scan/savedScanResumeV110318.js';

// Historical shape: duplicate load IDs, an overwritten contract reference,
// missing OCR text, and the correct original present only in the local vault.
const old={id:'foreign-document',localDocumentId:'foreign-local',clientDocumentId:'foreign-client',type:'rate_confirmation',canonicalLoadNo:'82002',broker:'Previous Freight LLC',extracted:{loadNo:'82002',broker:'Previous Freight LLC'}};
const load={id:'collision',loadNo:'82002',broker:old.broker,documentId:old.id,status:'completed',gross:2700,origin:'Wrong yard',destination:'Wrong receiver',aliases:[{kind:'bol_number',value:'FOREIGN55'}]};
const unrelated={...load,loadNo:'91001',documentId:'other-source'};
const store={loads:[unrelated,load],documents:[old],fuel:[{id:'preserve'}]};
const before=structuredClone(store);
const wrong='RATE CONFIRMATION\nLOAD #91001\nBroker: Previous Freight LLC';
const right='RATE CONFIRMATION\nLOAD #82002\nSelect Agent Name\nMC#: 984301\nEmail Invoicing: docs@goselect.com\nTOTAL CARRIER PAY: $1000\nPICKUP\nEaston, IL\nDELIVERY\nChicago, IL';
const rows=[
 {local_id:'foreign-local',client_document_id:'foreign-client',load_no:'82002',mime_type:'application/pdf',type:'rate_confirmation'},
 {local_id:'correct-local',client_document_id:'correct-client',load_no:'82002',mime_type:'application/pdf',type:'other',extracted:{type:'rate_confirmation',loadNo:'82002'}},
 {local_id:'receipt',client_document_id:'receipt-client',load_no:'82002',mime_type:'application/pdf',type:'fuel_receipt'},
];
const readIds=[];
const evidence=await readLegacyContractOriginalsV110327(store,rows,async row=>{readIds.push(row.local_id);return row;},async row=>({text:row.local_id==='foreign-local'?wrong:right}));
assert.deepEqual(readIds,['foreign-local','correct-local']);
assert.equal(evidence[1].qualified,true);
const next=applyLegacyContractOriginalsV110327(store,evidence);
assert.deepEqual(store,before);
assert.deepEqual(next.loads[0],unrelated,'duplicate IDs cannot change a different primary load');
assert.equal(next.loads[1].broker,'Select Transport Partners LLC');
assert.equal(next.loads[1].documentId,'correct-local');
assert.equal(next.loads[1].status,'completed');
assert.equal(next.loads[1].gross,1000);
assert.deepEqual(next.loads[1].legacySourceRepairV110327.previousLoad,load);
assert.equal(next.documents.find(d=>d.id===old.id).broker,old.broker,'a foreign original never gets renamed to the target broker');
assert.deepEqual(next.fuel,store.fuel);
assert.strictEqual(applyLegacyContractOriginalsV110327(next,evidence),next);
const guide={id:'guide-target',loadNo:'82002',broker:old.broker,sourceDocumentId:old.id,status:'completed',steps:[],stops:[],manualDone:{done:123},documents:{finalPodDocumentId:'pod-original'}};
const state={loadGuidesById:{[guide.id]:guide},activeLoadGuideId:guide.id,eventsByDay:{},loadInfo:{loadNo:'82002',broker:old.broker}};
const restored=restoreSavedLoadGuidesV110312(state,next);
assert.equal(restored.loadGuidesById[guide.id].identityReviewV110326,true);
assert.deepEqual(restored.loadGuidesById[guide.id].documents,guide.documents);
const candidate=collectLoadCandidatesV105(state,next).find(c=>c.loadNo==='82002');
assert.equal(candidate.broker,'Select Transport Partners LLC');
assert.notEqual(candidate.origin,'Wrong yard');
assert.ok(!candidate.aliases.some(alias=>alias.value==='FOREIGN55'),'foreign BOL references cannot auto-file another POD');
console.log('PASS — missing OCR is recovered from originals; corrected broker and source preserve the other load, lifecycle, POD and prior record');

for (const modified of [
 {...store,loads:[{...load,documentId:''}]},
 {...store,loads:[{...load,documentId:'new-driver-choice'}]},
 {...store,documents:[{...old,extracted:{...old.extracted,guideSourceTextV110312:right}}]},
]) assert.equal(applyLegacyContractOriginalsV110327(modified,evidence).loads[0].documentId,modified.loads[0].documentId,'no source substitution without a proven foreign explicit link');
const ambiguous=[...evidence,{...evidence[1],localId:'second-original',text:right+'\nDifferent trip'}];
assert.equal(applyLegacyContractOriginalsV110327(store,ambiguous).loads[1].documentId,old.id);
const unavailable=await readLegacyContractOriginalsV110327(store,rows,async()=>null,async()=>{throw Error('must not read');});
assert.strictEqual(applyLegacyContractOriginalsV110327(store,unavailable),store);
const changedFolder=evidence.map(item=>item.localId==='correct-local'?{...item,folder:'83003'}:item);
assert.equal(applyLegacyContractOriginalsV110327(store,changedFolder).loads[1].documentId,old.id);
const conflictingIds={...store,documents:[{...old,clientDocumentId:'different-original'}]};
assert.strictEqual(applyLegacyContractOriginalsV110327(conflictingIds,evidence),conflictingIds,'conflicting local and client IDs cannot authorize source proof');
assert.equal(savedScanResultV110318(old),null,'legacy contract without source text must be read again');
assert.equal(savedScanResultV110318(next.documents.find(d=>d.id===old.id)),null,'a foreign cached contract cannot reopen in the wrong folder');
assert.ok(savedScanResultV110318({type:'pod',canonicalLoadNo:'82002',extracted:{bolNo:'B123'}}),'reviewed POD remains resumable');
console.log('PASS — missing originals, changed links, ambiguous trips and differing printed numbers never guess; legacy contract resume re-reads original bytes');
