import assert from 'node:assert/strict';
import {applySmartDocumentLinkV103,buildDriverLoadGuideV103,getActiveLoadGuideV103} from '../source/src/modules/loads/loadGuideV103.js';
import {collectLoadCandidatesV105,buildVaultDocumentV105} from '../source/src/modules/documents/documentFoundationV105.js';
import {normalizeLoadInfoFromRouteLegs} from '../source/src/core/routes/routeNormalization.js';
import {normalizeBusinessStore,readBusinessStore,writeBusinessStore} from '../source/src/modules/business/businessStore.js';
import {restoreSavedLoadGuidesV110312} from '../source/src/modules/loads/savedLoadRecoveryV110312.js';
import {repairBusinessIdentityV110326,printedLoadReferencesV110326,savedDocumentIdentityV110326} from '../source/src/modules/loads/loadIdentityV110326.js';

const oldBroker='Previous Freight LLC', correctBroker='Current Transport Partners';
const fields={loadNo:'82002',orderNo:'82002',broker:correctBroker,origin:'Easton, IL',destination:'Chicago, IL',pickupDate:'2026-09-12',deliveryDate:'2026-09-13',stops:[
  {id:'pu',type:'pickup',city:'Easton',state:'IL',date:'2026-09-12'},
  {id:'delivery',type:'delivery',city:'Chicago',state:'IL',date:'2026-09-13'},
]};
const raw=`RATE CONFIRMATION\nLOAD NO: #82002\nBroker: ${correctBroker}\nPickup Easton, IL\nDelivery Chicago, IL`;
const old=buildDriverLoadGuideV103({loadNo:'91001',orderNo:'91001',broker:oldBroker,origin:'Elgin, IL',destination:'Canton, MI',equipment:'Power Only',trackingProvider:'FourKites',poNumber:'SHARED123'},{documentId:'old-source'});
old.manualDone={review_load:1,accept_tracking:1};
const initial={loadGuidesById:{[old.id]:old},activeLoadGuideId:old.id,loadInfo:{loadNo:old.loadNo,guideId:old.id,broker:oldBroker,rate:2700,equipment:'Power Only'},eventsByDay:{'2026-09-13':[{id:'unchanged',status:'OFF',startMin:0,endMin:600}]},routeLegsByDay:{}};
const before=structuredClone(initial);

for(const linkToLogbook of [false,true]) {
  const payloadFields={...fields,broker:'',poNumber:'SHARED123',linkToLogbook};
  const next=applySmartDocumentLinkV103(initial,{type:{id:'rate_confirmation'},fields:payloadFields,localDocument:{local_id:'new-source'},analysis:{text:raw}});
  assert.equal(next.loadInfo.loadNo,'82002');assert.equal(next.loadInfo.broker,'');
  assert.equal(next.loadInfo.rate,0);assert.equal(next.loadInfo.equipment,'');
  assert.equal(collectLoadCandidatesV105(next,{loads:[],documents:[]}).find(c=>c.loadNo==='82002').broker,'');
  assert.deepEqual(next.loadGuidesById.load_guide_82002.manualDone,{},'shared PO cannot copy completed steps');
}
assert.deepEqual(initial,before,'source state is immutable');
const changedRoute=normalizeLoadInfoFromRouteLegs({...initial,routeLegsByDay:{'2026-09-13':[{id:'new-route',loadNo:'82002',shippingDocs:'82002',pickupDay:'2026-09-13',pickupMin:600,fromCity:'Easton',fromState:'IL',toCity:'Chicago',toState:'IL',kind:'loaded',status:'open'}]}});
assert.equal(changedRoute.loadInfo.loadNo,'82002');assert.equal(changedRoute.loadInfo.broker,'');assert.equal(changedRoute.loadInfo.guideId,undefined);
console.log('PASS — contract import and route changes cannot copy another load’s broker, rate, equipment or progress');

const options={type:{id:'rate_confirmation'},fields,analysis:{text:raw},selectedLoadNo:'82002',match:{loadNo:'82002',broker:oldBroker},documentDate:'2026-09-13',userConfirmed:true};
const saved=buildVaultDocumentV105(options);
assert.equal(saved.broker,correctBroker);
assert.equal(buildVaultDocumentV105({...options,fields:{...fields,broker:''},analysis:{text:'LOAD #82002'}}).broker,'');
assert.throws(()=>buildVaultDocumentV105({...options,selectedLoadNo:'91001'}),/load number.*differs/i);
assert.equal(buildVaultDocumentV105({...options,type:{id:'pod'}}).broker,oldBroker,'driver-selected POD keeps its selected folder');
assert.deepEqual(printedLoadReferencesV110326('LOAD NO: #82002 Page 1\nLOAD NO: #82002 Page 2\nPickup #178564'),['82002']);
console.log('PASS — saving a contract preserves its own broker and rejects a different printed load number');

const logoOnlyBroker='RATE CONFIRMATION\nLOAD #82003\nSelect Agent Name\nCorporate Information\nMC#: 984301\nEmail Invoicing: docs@goselect.com';
const logoOptions={...options,fields:{loadNo:'82003',broker:''},selectedLoadNo:'82003',analysis:{text:logoOnlyBroker}};
assert.equal(buildVaultDocumentV105(logoOptions).broker,'Select Transport Partners LLC');
assert.equal(buildVaultDocumentV105({...logoOptions,analysis:{text:'LOAD #82003\nEmail: docs@goselect.com'}}).broker,'','an email alone cannot identify the broker');
assert.equal(savedDocumentIdentityV110326({type:'rate_confirmation',canonicalLoadNo:'82003',broker:oldBroker,extracted:{broker:oldBroker,guideSourceTextV110312:logoOnlyBroker}}).broker,'Select Transport Partners LLC');
assert.equal(savedDocumentIdentityV110326({type:'rate_confirmation',canonicalLoadNo:'82004',extracted:{guideSourceTextV110312:'TQL PO#82004\nTQL CONTACT INFO'}}).broker,'Total Quality Logistics (TQL)');
console.log('PASS — corporate source evidence identifies a broker when PDF text omits its logo; an email alone is insufficient');

const record={id:'new-source',type:'rate_confirmation',canonicalLoadNo:'82002',broker:oldBroker,status:'verified',documentDate:'2026-09-13',createdAt:Date.now(),extracted:{...fields,guideSourceTextV110312:raw}};
const store={loads:[{id:'load_82002',loadNo:'82002',broker:oldBroker,origin:'Wrong place',source:'rate_confirmation_v105',documentId:record.id},{id:'load_91001',loadNo:'91001',broker:oldBroker,source:'rate_confirmation_v105'}],documents:[record]};
const originalStore=structuredClone(store),repaired=normalizeBusinessStore(store);
assert.equal(repaired.documents[0].broker,correctBroker);assert.equal(repaired.loads[0].broker,correctBroker);assert.equal(repaired.loads[0].origin,fields.origin);
assert.equal(repaired.loads[1].broker,oldBroker);assert.deepEqual(store,originalStore);
const unlinked={...store,loads:[{...store.loads[0],documentId:undefined,origin:'Unrelated historical origin',createdAt:123,updatedAt:123}]};
assert.deepEqual(normalizeBusinessStore(unlinked).loads[0],unlinked.loads[0],'a reused number cannot repair a load without explicit source linkage');
assert.equal(collectLoadCandidatesV105({},unlinked)[0]?.broker,oldBroker,'an unlinked folder cannot borrow a source broker by number');
assert.strictEqual(repairBusinessIdentityV110326(repaired),repaired,'repair is idempotent');
const mixed=buildDriverLoadGuideV103({...fields,broker:oldBroker,origin:'Wrong place',trackingProvider:'FourKites'},{documentId:record.id});
mixed.manualDone={accept_tracking:1};
const mixedState={...initial,loadGuidesById:{[old.id]:old,[mixed.id]:mixed},activeLoadGuideId:mixed.id,loadInfo:{loadNo:'82002',guideId:mixed.id,broker:oldBroker}};
assert.equal(collectLoadCandidatesV105(mixedState,store).find(c=>c.loadNo==='82002').broker,correctBroker,'correct source beats stale guide label');
const restored=restoreSavedLoadGuidesV110312(mixedState,store);
assert.equal(restored.loadGuidesById[mixed.id].broker,correctBroker);
assert.equal(restored.loadInfo.broker,correctBroker);
assert.deepEqual(restored.loadGuidesById[mixed.id].brokerRepairV110326.previousGuide,mixed);
assert.equal(restored.loadGuidesById[mixed.id].manualDone.accept_tracking,undefined,'changed tracking requirements need their own confirmation');
assert.deepEqual(restored.eventsByDay,initial.eventsByDay);
assert.strictEqual(restoreSavedLoadGuidesV110312(restored,repaired),restored);
const progressed=buildDriverLoadGuideV103({...fields,broker:oldBroker},{documentId:record.id,sourceText:raw});
progressed.manualDone={delivery_docs_1:123,complete_stop_1:456};progressed.completedStopIds=['1'];
progressed.documents={rateConfirmationDocumentId:record.id,documentIds:[record.id,'saved-bol','saved-pod'],bolDocumentId:'saved-bol',finalPodDocumentId:'saved-pod'};
const preserved=restoreSavedLoadGuidesV110312({...mixedState,loadGuidesById:{[progressed.id]:progressed}},store).loadGuidesById[progressed.id];
assert.deepEqual(preserved.manualDone,progressed.manualDone,'broker label repair preserves unchanged task confirmations');
assert.deepEqual(preserved.completedStopIds,progressed.completedStopIds);
assert.deepEqual(preserved.documents,progressed.documents,'broker repair retains attached BOL and POD references');
const closed={...mixedState,loadGuidesById:{[mixed.id]:{...mixed,status:'completed',excludedFromActiveLoad:true,completedAt:123}},activeLoadGuideId:''};
const afterClosed=restoreSavedLoadGuidesV110312(closed,store);
assert.equal(afterClosed.loadGuidesById[mixed.id].status,'completed');assert.notEqual(afterClosed.activeLoadGuideId,mixed.id);
const weak={...store,documents:[{...record,extracted:{...fields,guideSourceTextV110312:''}}]};
assert.equal(normalizeBusinessStore(weak).loads[0].broker,oldBroker,'missing source evidence never guesses a broker');
const foreign={...store,documents:[{...record,extracted:{...fields,guideSourceTextV110312:'RATE CONFIRMATION\nLOAD #91001\nBroker: Previous Freight LLC'}}]};
const quarantined=restoreSavedLoadGuidesV110312(mixedState,foreign);
assert.equal(quarantined.loadGuidesById[mixed.id].identityReviewV110326,true);
assert.notEqual(getActiveLoadGuideV103(quarantined)?.id,mixed.id);
assert.deepEqual(quarantined.eventsByDay,initial.eventsByDay);
assert.equal(collectLoadCandidatesV105(quarantined,foreign).find(c=>c.loadNo==='82002').identityReviewV110326,true);
console.log('PASS — stored corrections require source proof, preserve originals and closed loads, and quarantine mixed source documents');

// Drive the actual scanner save handler, including the preflight before file IO.
const {mount,resetStore}=await import('./test-scanner-load-link-v11037.mjs');
resetStore();writeBusinessStore(store);
let ui=mount();await ui.scan({type:{id:'rate_confirmation',label:'Rate Confirmation'},fields:{...fields,documentDate:'2026-09-13'},text:raw,confidence:.96,needsReview:true});
await ui.choose('Load folder','82002');await ui.save();
assert.equal(readBusinessStore().documents[0].broker,correctBroker);
assert.equal(readBusinessStore().loads.find(l=>l.loadNo==='82002').broker,correctBroker);
resetStore();ui=mount();await ui.scan({type:{id:'rate_confirmation',label:'Rate Confirmation'},fields:{...fields,documentDate:'2026-09-13'},text:raw,confidence:.96,needsReview:true});
await ui.choose('Load folder','97155');
const review=ui.all().find(n=>n.props?.className==='scan-driver-check-v105');
if(review){review.props.children[0].props.onChange({target:{checked:true}});ui.render();}
await ui.all().find(n=>n.props?.className==='scan-save-v105').props.onClick();ui.render();
assert.equal(globalThis.__scanIO.saved.length,0,'wrong contract folder rejected before storing any file');
assert.match(ui.text(),/load number.*differs/i);
console.log('PASS — production scanner save/reopen keeps the correct broker; mismatched contract produces no write');
