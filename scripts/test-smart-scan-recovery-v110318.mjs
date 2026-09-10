import assert from 'node:assert/strict';
import {buildSavedDocumentGuideV110312,restoreSavedLoadGuidesV110312,pendingSavedLoadScanV110312} from '../source/src/modules/loads/savedLoadRecoveryV110312.js';
import {getActiveLoadGuideV103} from '../source/src/modules/loads/loadGuideV103.js';
import {qualifyDocumentFieldsV11038} from '../source/src/modules/scan/documentFieldSemanticsV11038.js';
import {spawnSync} from 'node:child_process';
import {matchScanDocumentToLoadV11037} from '../source/src/modules/scan/scanLoadAssignmentV11037.js';
import {compactRateConSaveFieldsV10964} from '../source/src/modules/scan/rateConSaveStabilityV10964.js';
import {referencesFromDocumentV105} from '../source/src/modules/documents/documentFoundationV105.js';
import {savedScanResultV110318} from '../source/src/modules/scan/savedScanResumeV110318.js';

const rate={id:'saved-rate',type:'rate_confirmation',status:'verified',canonicalLoadNo:'76543210',broker:'Example Freight',createdAt:Date.now(),documentDate:'2026-09-08',extracted:{loadNo:'76543210',orderNo:'76543210',broker:'Example Freight',origin:'Howe, IN',destination:'Smithfield, RI',pickupDate:'2026-09-08',stops:[{type:'pickup',city:'Howe',state:'IN',date:'2026-09-08'},{type:'delivery',city:'Smithfield',state:'RI',date:''}]}};
for(const doc of [rate,{...rate,extracted:{...rate.extracted,pickupDate:'',stops:undefined}},{...rate,extracted:{...rate.extracted,stops:undefined}},{...rate,broker:'',extracted:{...rate.extracted,broker:''}},{...rate,status:'needs_review',documentDate:'',loadAssignmentStatusV11037:'driver_selected'}]) {
  const guide=buildSavedDocumentGuideV110312(doc);assert.ok(guide,'A saved load opens with incomplete appointments');
  const restored=restoreSavedLoadGuidesV110312({}, {documents:[doc]});
  assert.equal(getActiveLoadGuideV103(restored)?.loadNo,rate.canonicalLoadNo);
  assert.equal(pendingSavedLoadScanV110312(restored,{documents:[doc]}),null);
  assert.equal(guide.stops.at(-1).date,'','Missing delivery dates stay blank');
}
for(const fields of [{loadNo:rate.canonicalLoadNo,pickupDate:'2026-09-08'},{origin:'Howe, IN'},{stops:[{type:'pickup'},{type:'delivery'}]}]) {
  const unread={...rate,extracted:fields};
  assert.equal(buildSavedDocumentGuideV110312(unread),null,'Missing route remains available for scan review');
  const restored=restoreSavedLoadGuidesV110312({}, {documents:[unread]});
  assert.equal(getActiveLoadGuideV103(restored),null);
  assert.equal(pendingSavedLoadScanV110312(restored,{documents:[unread]}).id,rate.id);
}
const routeLessCache={...buildSavedDocumentGuideV110312(rate),stops:[]};
assert.equal(buildSavedDocumentGuideV110312({...rate,extracted:{},loadGuideV110312:routeLessCache}),null);
assert.equal(pendingSavedLoadScanV110312({loadGuidesById:{bad:routeLessCache}},{documents:[rate]}).id,rate.id);
assert.equal(buildSavedDocumentGuideV110312({...rate,status:'archived'}),null);
assert.equal(buildSavedDocumentGuideV110312({...rate,status:'needs_review',canonicalLoadNo:''}),null);
assert.equal(buildSavedDocumentGuideV110312({...rate,broker:'Different Broker'}),null);
console.log('PASS — verified saved Rate Cons restore a mission with missing dates, broker or explicit stops; closed/conflicting records stay closed');

const bolText='BOL#82004117\nSHIP FROM: Example Door Company\nSHIP TO: Example Millwork\nCARRIER: Example Carrier LLC\nSHIPPING DATE: 09/09/2026, 08:00\nPU#54321123\nPO NUMBER: 12345678, 87654321';
if(process.env.SCAN_ROUTER_ONLY_V110318){
  const {finalizeSmartScanAnalysisV11039}=await import('../source/src/modules/scan/engines/isolatedDocumentRouterV10959.js');
  assert.equal(finalizeSmartScanAnalysisV11039({type:{id:'other'},text:bolText,fields:{},confidence:.2}).type.id,'bol');
  process.exit(0);
}
const routerCheck=spawnSync(process.execPath,[process.argv[1]],{env:{...process.env,SCAN_ROUTER_ONLY_V110318:'1'},encoding:'utf8'});
assert.equal(routerCheck.status,0,routerCheck.stderr);
const bol=qualifyDocumentFieldsV11038({type:{id:'bol'},text:bolText,fields:{},confidence:.9});
assert.equal(bol.type.id,'bol');assert.equal(bol.fields.bolNo,'82004117');
assert.equal(bol.fields.documentDate,'2026-09-09');assert.equal(bol.fields.pickupNumber,'54321123');
assert.deepEqual(bol.fields.poNumbers,['12345678','87654321']);
const compact=compactRateConSaveFieldsV10964(bol.fields);
assert.ok(referencesFromDocumentV105(compact).some(r=>r.kind==='po_number' && r.value==='87654321'));
const loads=[{id:'load_76543210',loadNo:'76543210',broker:'Example Freight',source:'rate_confirmation_v105',aliases:[{kind:'pickup_number',value:'82004117'}]}];
const opts={state:{},businessStore:{loads,documents:[]},typeId:'bol',fields:bol.fields,analysis:bol};
assert.equal(matchScanDocumentToLoadV11037(opts).loadNo,'76543210','BOL number matches an existing broker pickup reference');
const olderLoad={...loads[0],updatedAt:1,aliases:[],stops:[{type:'pickup',city:'Howe',state:'IN',pickupNumber:'82004117'}]};
const newerLoads=Array.from({length:10},(_,i)=>({...loads[0],id:'load_'+(88000000+i),loadNo:String(88000000+i),aliases:[],updatedAt:100+i}));
assert.equal(matchScanDocumentToLoadV11037({...opts,businessStore:{loads:[...newerLoads,olderLoad]}}).loadNo,'76543210','An exact stop reference on an older load survives the eight-result ranking limit');
assert.equal(matchScanDocumentToLoadV11037({...opts,businessStore:{loads:[...loads,{...loads[0],id:'load_99999111',loadNo:'99999111'}]}}).loadNo,'','A shared reference needs a choice');
assert.equal(matchScanDocumentToLoadV11037({...opts,analysis:{...bol,text:bol.text.replaceAll('82004117','00000000')}}).loadNo,'','An absent reference cannot auto-link');
assert.equal(matchScanDocumentToLoadV11037({...opts,businessStore:{loads:[{...loads[0],aliases:[{kind:'trailerNo',value:'82004117'}]}]}}).loadNo,'','Equipment is not shipping identity');
for(const label of ['B.O.L. Number: ','B/L ID: ','BOL#','BILL OF LADING NUMBER: '])assert.equal(qualifyDocumentFieldsV11038({type:{id:'bol'},text:label+'82004117'}).fields.bolNo,'82004117');
console.log('PASS — real BOL classifier and labeled parser recognize compact labels, pickup references and all POs; matching survives storage and rejects ambiguity');

const resumed=savedScanResultV110318({...rate,loadAssignmentStatusV11037:'driver_selected'});
assert.equal(resumed.resumedRecordV110318.loadNo,'76543210');assert.equal(resumed.resumedRecordV110318.assignment,'driver_selected');
assert.equal(savedScanResultV110318({type:'rate_confirmation',extracted:{}}),null);
assert.equal(savedScanResultV110318({type:'rate_confirmation',extracted:{type:'rate_confirmation',title:'Rate Confirmation',stopSequence:0,linkToLogbook:false,broker:'Example Freight'}}),null,'An unread legacy scan must run the improved reader');
assert.equal(savedScanResultV110318({...rate,extracted:{}},{extracted:rate.extracted}).fields.origin,'Howe, IN','IndexedDB extraction restores a compacted business record');

const {mount,resetStore}=await import('./test-scanner-load-link-v11037.mjs');
const {readBusinessStore,writeBusinessStore,compactBusinessStoreForQuotaV10963}=await import('../source/src/modules/business/businessStore.js');
resetStore();let ui=mount();await ui.scan({...resumed,type:{id:'rate_confirmation'},resumedRecordV110318:{...resumed.resumedRecordV110318,date:'2026-09-08'}});
assert.equal(ui.byLabel('Load folder').props.value,'76543210');assert.equal(ui.byLabel('Document date').props.value,'2026-09-08');
const risk=ui.all().find(n=>n.props?.className==='ratecon-risk-ack-v10970');if(risk){risk.props.children[0].props.onChange({target:{checked:true}});ui.render();}
await ui.save();
assert.ok(readBusinessStore().documents[0].loadGuideV110312);assert.match(ui.text(),/Done · Open guide/);
resetStore();writeBusinessStore({...readBusinessStore(),loads});ui=mount();await ui.scan(bol);assert.equal(ui.byLabel('Load folder').props.value,'76543210');await ui.save();
let saved=readBusinessStore().documents[0];assert.equal(saved.canonicalLoadNo,'76543210');assert.equal(saved.linkToLogbook,true);assert.match(ui.text(),/Done · Open load/);
assert.ok(saved.references.some(r=>r.value==='87654321'));
saved=compactBusinessStoreForQuotaV10963({...readBusinessStore(),documents:[saved]}).documents[0];assert.ok(saved.extracted.poNumbers.includes('87654321'));
console.log('PASS — actual scan/save handlers preserve the resumed folder, create the guide and save BOL to load plus Logbook reference');
