import test from 'node:test';
import assert from 'node:assert/strict';
import {collectShipmentScanCandidates} from '../../source/src/modules/scan/shipmentFiling.js';
import {loadPickerCandidates} from '../../source/src/modules/scan/loadPickerV110472.js';
import {operationalCandidateContext,currentOperationalLoad} from '../../source/src/modules/loads/currentLoadV110473.js';
const event=(id,reference,extra={})=>({id,status:'ON',startMin:600,note:'Pickup / Loading',shippingDocs:reference,city:'Example City',state:'IL',destination:'Example Town, OH',...extra});
const review=(id,reference,extra={})=>({id:'review-'+id,driver_id:'driver_primary',pickup_event_id:id,pickup_day:'2026-10-01',shipment_reference:reference,status:'completed',basis:'user_confirmed',confirmed_at:'2026-11-05T12:00:00Z',...extra});
const fixture=()=>({eventsByDay:{'2026-10-01':[event('old','OLD-101')],'2026-11-04':[event('current','CURRENT-202')]},signatureByDay:{'2026-10-01':{signature:'unchanged-signed-original'}},shipmentCompletionReviewsV1:[review('old','OLD-101')]});
const choices=state=>loadPickerCandidates(collectShipmentScanCandidates(state,{}),state,{},operationalCandidateContext(state,{}, {day:'2026-11-05',minute:800}));
test('confirmed old shipments become Completed, remain selectable and current pickup stays first without changing signed records',()=>{
 const state=fixture(),before=structuredClone(state),rows=choices(state);
 assert.equal(rows[0].loadNo,'CURRENT-202');assert.equal(rows[0].active,true);
 const old=rows.find(r=>r.loadNo==='OLD-101');assert.equal(old.status,'completed');assert.equal(old.active,false);assert.equal(old.shipmentFiling,true);
 assert.equal(old.deliveryDate,'','confirmation does not invent a delivery date');assert.equal(old.broker,'');assert.deepEqual(state,before);
});
test('a future pickup reusing a reference is not closed by an old confirmation',()=>{
 const state=fixture();state.eventsByDay['2026-11-04']=[event('new-reuse','OLD-101')];
 assert.equal(choices(state).find(r=>r.loadNo==='OLD-101').status,'open');
});
test('wrong day, driver, identity and reference cannot close a shipment; an explicit reopen wins',()=>{
 for(const changed of [{pickup_day:'2026-10-02'},{driver_id:'another-driver'},{pickup_event_id:'different'},{shipment_reference:'OTHER'},{basis:'guessed'}]){
  const state=fixture();state.shipmentCompletionReviewsV1=[review('old','OLD-101',changed)];assert.equal(choices(state).find(r=>r.loadNo==='OLD-101').status,'open');
 }
 const state=fixture();state.shipmentCompletionReviewsV1.push(review('old','OLD-101',{id:'new',status:'open',confirmed_at:'2026-11-06T12:00:00Z'}));
 assert.equal(choices(state).find(r=>r.loadNo==='OLD-101').status,'open');
});
test('starting another job or a planned delivery date alone cannot close an older pickup',()=>{
 const state=fixture();state.shipmentCompletionReviewsV1=[];
 state.routeLegsByDay={'2026-10-01':[{id:'old-route',pickupEventId:'old',loadNo:'OLD-101',deliveryDay:'2026-10-02',status:'open'}]};
 assert.equal(choices(state).find(r=>r.loadNo==='OLD-101').status,'open');
});
test('explicit delivered reference on an empty drop and hook closes the prior pickup and never creates another pickup',()=>{
 const state={eventsByDay:{'2026-10-01':[event('pickup','',{note:'Drop & Hook',pickedUpLoadNo:'OLD-101',deliveredLoadNo:'PREVIOUS-303'})],
 '2026-10-02':[event('empty','',{note:'Pre-trip inspection',description:'Drop & Hook',noLoadDeclared:true,deliveredLoadNo:'OLD-101'})]}};
 const rows=collectShipmentScanCandidates(state,{}).filter(r=>r.shipmentFiling);
 assert.equal(rows.length,1);assert.equal(rows[0].loadNo,'OLD-101');assert.equal(rows[0].shipmentEventId,'pickup');assert.equal(rows[0].status,'completed');assert.equal(rows[0].deliveryDate,'2026-10-02');
});
test('a confirmation also prevents the old reference from remaining on Home',()=>{
 const state=fixture();delete state.eventsByDay['2026-11-04'];state.routeLegsByDay={'2026-10-01':[{id:'old-route',pickupEventId:'old',loadNo:'OLD-101',fromCity:'Example City',fromState:'IL',toCity:'Example Town',toState:'OH',status:'open'}]};
 assert.equal(currentOperationalLoad(state,{}, {day:'2026-11-05',minute:800}),null);
});
