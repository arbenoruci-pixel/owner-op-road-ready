import test from 'node:test';
import assert from 'node:assert/strict';
import {currentOperationalLoad,operationalLoadStatus,operationalCandidateContext,businessLoadRows} from '../../source/src/modules/loads/currentLoadV110473.js';
import {loadPickerCandidates} from './loadPicker.js';
import {migrateBusinessStoreV105} from '../../source/src/modules/documents/documentFoundationV105.js';
const at={day:'2026-10-14',minute:500};
const fixture=()=>({
 state:{loadInfo:{loadNo:'BROKER-1',shippingDocs:'SHIPPER-REF'},eventsByDay:{
  '2026-10-08':[{id:'pickup',status:'ON',startMin:600,note:'Pickup / Loading',shippingDocs:'SHIPPER-REF',city:'Example City',state:'ME'}],
  '2026-10-12':[{id:'delivery',status:'ON',startMin:900,note:'Delivery / Unloading',loadNo:'BROKER-1',shippingDocs:'BROKER-1'}]},
  routeLegsByDay:{'2026-10-08':[{id:'shipment',day:'2026-10-08',pickupEventId:'pickup',shippingDocs:'SHIPPER-REF',loadNo:'SHIPPER-REF',fromCity:'Example City',fromState:'ME',toCity:'Example Town',toState:'NE',status:'open'}],
   '2026-10-12':[{id:'drop',day:'2026-10-12',deliveryEventId:'delivery',loadNo:'BROKER-1',status:'delivered'}]}},
 store:{loads:[{id:'broker',loadNo:'BROKER-1',broker:'Example Broker',status:'booked',pickupDate:'2026-10-08',deliveryDate:'2026-10-12',gross:4000,origin:'Example City, ME',destination:'Example Town, NE'}],
  evidenceAliases:[{from:'SHIPPER-REF',to:'BROKER-1'}],documents:[]},
});
test('reviewed shipment reference resolves to the broker number before delivery in every view',()=>{
 const {state,store}=fixture(),context={day:'2026-10-10',minute:500},before=structuredClone({state,store});
 const current=currentOperationalLoad(state,store,context);
 assert.equal(current.loadNo,'BROKER-1');assert.equal(current.identity,'load');assert.equal(current.shipmentReference,'SHIPPER-REF');
 assert.equal(current.broker,'Example Broker');
 const combined=operationalCandidateContext(state,store,context);
 const cards=loadPickerCandidates([{loadNo:'BROKER-1',status:'open'}],state,store,combined);
 assert.equal(cards[0].active,true);assert.equal(businessLoadRows(store,combined)[0].status,'in_transit');
 assert.deepEqual({state,store},before);
});
test('delivery under the broker number closes the reviewed shipper reference and the stale form',()=>{
 const {state,store}=fixture(),before=structuredClone({state,store});
 assert.equal(currentOperationalLoad(state,store,at),null);
 assert.equal(operationalLoadStatus(state,store,store.loads[0],at),'delivered');
 const context=operationalCandidateContext(state,store,at);
 assert.equal(businessLoadRows(store,context)[0].status,'delivered');
 const cards=loadPickerCandidates([{loadNo:'BROKER-1',status:'open',active:true}],state,store,context);
 assert.equal(cards[0].active,false);assert.equal(cards[0].status,'completed');
 assert.deepEqual({state,store},before,'projection does not rewrite the log or financial records');
});
test('same route and broker without a reviewed link remain a shipment reference',()=>{
 const {state,store}=fixture();store.evidenceAliases=[];
 const current=currentOperationalLoad(state,store,at);
 assert.equal(current.identity,'reference');assert.equal(current.shipmentReference,'SHIPPER-REF');assert.equal(current.canonicalLoadNo,'');
 assert.equal(operationalCandidateContext(state,store,at).statuses['BROKER-1'],'delivered');
});
test('a conflicting alias cannot identify a broker load or clear a different document warning',()=>{
 const {state,store}=fixture();store.loads.push({loadNo:'BROKER-2',status:'booked'});store.evidenceAliases.push({from:'SHIPPER-REF',to:'BROKER-2'});
 assert.equal(currentOperationalLoad(state,store,at).identity,'reference');
});
test('a fresh recorded pickup takes precedence over the completed load still in the form',()=>{
 const {state,store}=fixture();state.eventsByDay['2026-10-14']=[{id:'next-pickup',status:'ON',startMin:400,note:'Pickup',loadNo:'BROKER-2'}];
 state.routeLegsByDay['2026-10-14']=[{id:'next',day:'2026-10-14',loadNo:'BROKER-2',pickupEventId:'next-pickup',fromCity:'New City',fromState:'IL',toCity:'New Town',toState:'OH',status:'open'}];
 store.loads.push({id:'next',loadNo:'BROKER-2',status:'booked',pickupDate:'2026-10-14'});
 assert.equal(currentOperationalLoad(state,store,at).loadNo,'BROKER-2');
 assert.equal(businessLoadRows(store,operationalCandidateContext(state,store,at))[0].loadNo,'BROKER-2');
});
test('a partial multistop delivery keeps the remaining load in transit',()=>{
 const {state,store}=fixture();state.loadGuidesById={multi:{id:'multi',loadNo:'BROKER-1',source:'rate_confirmation',status:'active',deliveryCount:2,stops:[{id:'one',type:'delivery'},{id:'two',type:'delivery'}],completedStopIds:['one']}};
 assert.equal(operationalLoadStatus(state,store,store.loads[0],at),'in_transit');
});
test('future delivery evidence never closes the load early',()=>{
 const {state,store}=fixture();assert.equal(operationalLoadStatus(state,store,store.loads[0],{day:'2026-10-10',minute:500}),'in_transit');
});
test('financial invoice and paid states retain their labels and values',()=>{
 const {state,store}=fixture();store.loads[0].status='invoiced';
 const view=businessLoadRows(store,operationalCandidateContext(state,store,at));
 assert.equal(view[0].status,'invoiced');assert.equal(view[0].gross,4000);assert.equal(store.loads[0].status,'invoiced');
});
test('scanner migration retains reviewed alias evidence and reaches the same operational load',()=>{
 const {state,store}=fixture(),before=structuredClone(store),migrated=migrateBusinessStoreV105(store,state);
 assert.deepEqual(migrated.evidenceAliases,store.evidenceAliases);assert.deepEqual(store,before);
 const active=operationalCandidateContext(state,migrated,{day:'2026-10-10',minute:500});
 assert.equal(active.current.loadNo,'BROKER-1');
 const rows=loadPickerCandidates([{loadNo:'BROKER-1',status:'open'}],state,migrated,active);
 assert.equal(rows[0].active,true);
 assert.equal(operationalCandidateContext(state,migrated,at).current,null);
});
