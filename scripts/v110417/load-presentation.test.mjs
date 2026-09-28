import assert from 'node:assert/strict';
import {serviceDates,serviceStage,chronologicalLoads} from '../../source/src/modules/owneros/loadPresentationV110417.js';
import {loadView} from '../../source/src/modules/owneros/driverDocumentsV110415.js';
import {reconcileLoadFoldersV10974 as reconcile} from '../../source/src/modules/owneros/loadFolderReconciliationV10974.js';
import {documentWeeks} from '../../source/src/modules/owneros/documentWeeksV110416.js';

const loads=[
  {id:'a',loadNo:'LOAD100',pickupDate:'2026-09-23',deliveryDate:'2026-09-24',documentWorkflowStage:'delivered',origin:'Alpha, IL',destination:'Beta, IN'},
  {id:'b',loadNo:'LOAD200',pickupDate:'2026-09-24',deliveryDate:'2026-09-25',documentWorkflowStage:'delivered'},
  {id:'c',loadNo:'LOAD300',pickupDate:'2026-09-25',deliveryDate:'2026-09-28',documentWorkflowStage:'picked_up'},
  {id:'d',loadNo:'LOAD400',pickupDate:'2026-09-25',documentWorkflowStage:'tonu'},
  {id:'e',loadNo:'PRIOR500',pickupDate:'2026-09-14',documentWorkflowStage:'booked'}
];
const state={eventsByDay:{},routeLegsByDay:{'2026-09-23':[{loadNo:'LOAD100',date:'2026-09-23'}],'2026-09-25':[{loadNo:'LOAD100',date:'2026-09-25'}]}};
const businessStore={loads,documents:[],fuel:[],expenses:[]};
const before=JSON.stringify({state,businessStore});
const m=reconcile({loads,state,businessStore});
const weeks=documentWeeks(m.folders,m.archiveState,m.evidenceStore);
assert.deepEqual(weeks.map(w=>[w.id,w.items.map(f=>f.loadNo)]),[['2026-09-21',['LOAD300','LOAD400','LOAD200','LOAD100']],['2026-09-14',['PRIOR500']]],'saved pickup dates file new loads and ordering follows service start');
assert.equal(loadView(m.folders.find(f=>f.loadNo==='LOAD100'),[],businessStore).cardDate,'Sep 23 – Sep 24 · Delivered','a later linked log day is not the delivery date');
assert.equal(loadView(m.folders.find(f=>f.loadNo==='LOAD300'),[],businessStore).cardDate,'Pickup Sep 25 · Delivery Sep 28','planned delivery is explicit');
assert.equal(weeks.some(w=>w.id==='2026-09-28'),false,'planned delivery never creates a second folder');
assert.equal(serviceDates({days:['2026-09-25','2026-09-23']}).cardDate,'Recorded Sep 23 – Sep 25','activity-only dates have their own label and are sorted');
assert.equal(serviceDates({pickupDate:'2026-09-14',documentWorkflowStage:'booked'}).cardDate,'Pickup planned Sep 14');
assert.equal(serviceDates({pickupDate:'2026-09-25',deliveryDate:'2026-09-28',documentWorkflowStage:'tonu'}).cardDate,'Sep 25 · Cancelled');
assert.equal(serviceStage({status:'archived',documentTransferEvidence:{originalStatus:'delivered'}}),'delivered');
assert.equal(serviceDates({status:'archived',documentTransferEvidence:{originalStatus:'delivered'},pickupDate:'2026-09-23',deliveryDate:'2026-09-24'}).cardDate,'Sep 23 – Sep 24 · Delivered');
assert.equal(serviceDates({pickupDate:'2026-09-23',deliveryDate:'2026-09-25',deliveredDate:'2026-09-24'}).cardDate,'Sep 23 – Sep 24 · Delivered');
assert.equal(serviceDates({deliveryDate:'2026-09-28',documentWorkflowStage:'booked'}).filingDays.length,0,'unknown pickup remains undated instead of assuming delivery happened');
assert.equal(loadView({loadNo:'PLANNED',status:'complete',checklist:[],days:[]},[],{loads:[{loadNo:'PLANNED',pickupDate:'2026-09-25',deliveryDate:'2026-09-28'}]},'2026-09-27').cardDate,'Pickup Sep 25 · Delivery Sep 28','folder checklist completion never marks a service delivered');
assert.deepEqual(chronologicalLoads(m.folders,businessStore).map(f=>f.loadNo),['LOAD300','LOAD400','LOAD200','LOAD100','PRIOR500']);

// A packet's invoice date cannot replace its signed POD date.
const fields={date:'2026-09-29',loadNo:'LOAD100',merchant:'Example',origin:'Alpha, IL',destination:'Beta, IN',pickupDate:'2026-09-23',deliveryDate:'2026-09-25',total:500,currency:'USD',reference:'BOL100',podSigned:true};
const hash='a'.repeat(64),packet={local_id:'packet',load_no:'LOAD100',type:'supporting_packet',sha256:hash,extracted:{evidenceFactsV1:{version:1,sourceSha256:hash,reviewedAt:'2026-09-29',fields,components:[{kind:'pod',fields:{...fields,date:'2026-09-24'},reviewed:true,pages:[2]}]}}};
const view=loadView({loadNo:'LOAD100',days:['2026-09-23','2026-09-25']},[packet],{loads:[{...loads[0],deliveryDate:'2026-09-25'}]});
assert.equal(view.service,'Delivered Sep 24');assert.equal(view.cardDate,'Sep 23 – Sep 24 · Delivered');
const crossWeek=reconcile({loads:[{...loads[0],pickupDate:'2026-09-25',deliveryDate:'2026-09-28'}],state:{eventsByDay:{},routeLegsByDay:{'2026-09-25':[{loadNo:'LOAD100',date:'2026-09-25'}],'2026-09-28':[{loadNo:'LOAD100',date:'2026-09-28'}]}},businessStore});
assert.deepEqual(documentWeeks(crossWeek.folders,crossWeek.archiveState,crossWeek.evidenceStore).map(w=>w.id),['2026-09-28','2026-09-21'],'real activity in both weeks remains accessible');
assert.equal(JSON.stringify({state,businessStore}),before,'presentation never changes loads or logs');
console.log('PASS — clear service dates, chronological cards, undated pickup fallback, planned delivery, TONU, archived status, packet POD dates and immutable records');
