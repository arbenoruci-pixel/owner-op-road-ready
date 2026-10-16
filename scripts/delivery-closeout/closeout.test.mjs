import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {deliveryRouteChoices,prepareDeliveryPayload,completeDeliveryRoute,finishDeliveryState,deliveryRouteMatch} from '../../source/src/core/routes/deliveryCloseoutV110475.js';
import {routeLegsForDayCanonical} from '../../source/src/core/routes/routeNormalization.js';
import {shipmentContextForEvents} from '../../source/src/core/routes/shipmentCarryover.js';
const pickupDay='2026-09-08',day='2026-09-12',at={day,minute:887};
const event={id:'unload',status:'ON',startMin:887,endMin:917,note:'Pre-trip inspection · Delivery / Unloading',reasons:['Pre-trip inspection','Delivery / Unloading'],city:'Springfield',state:'NE',shippingDocs:'BROKER-REF',loadNo:'BROKER-REF',destination:'Omaha, NE'};
const payload={...event,reason:event.note,deliveryRouteId:'shipment'};
function fixture(){return {eventsByDay:{[pickupDay]:[{id:'pickup',status:'ON',startMin:600,endMin:620,note:'Pickup / Loading',shippingDocs:'SHIPPER-REF',city:'Lisbon',state:'ME'}]},routeLegsByDay:{[pickupDay]:[{id:'shipment',day:pickupDay,pickupDay,pickupEventId:'pickup',pickupMin:600,shippingDocs:'SHIPPER-REF',loadNo:'SHIPPER-REF',fromCity:'Lisbon',fromState:'ME',toCity:'Omaha',toState:'NE',status:'open',kind:'loaded'}]},loadInfo:{shippingDocs:'SHIPPER-REF',loadNo:'SHIPPER-REF'},manualMilesByDay:{[day]:570.4},signatureByDay:{[pickupDay]:{signed:true,signature:'retained'}},certifyStatus:{[pickupDay]:'Certified'}};}
function apply(s,p=payload){const input=prepareDeliveryPayload(s,p,at);const routes=completeDeliveryRoute(s.routeLegsByDay,day,input,event.id,at.minute,s);const next={...s,eventsByDay:{...s.eventsByDay,[day]:[{...event,...input,id:event.id}, {id:'empty',status:'D',startMin:917,endMin:1197,note:'Driving empty'}]},routeLegsByDay:routes,loadInfo:{...s.loadInfo,sourceEventId:event.id}};return {input,next:finishDeliveryState(next,input,event.id)};}
test('Omaha: broker number and original BOL close the explicitly selected route',()=>{
  const s=fixture(),before=structuredClone(s),{input,next}=apply(s);
  assert.equal(input.shippingDocs,'SHIPPER-REF');assert.equal(input.bol,'SHIPPER-REF');assert.equal(input.loadNo,'BROKER-REF');
  const row=next.routeLegsByDay[pickupDay][0];assert.equal(row.id,'shipment');assert.equal(row.pickupEventId,'pickup');assert.equal(row.deliveryEventId,'unload');assert.equal(row.status,'delivered');assert.equal(row.stopStatus,'done');assert.equal(row.deliveryMin,887);
  assert.equal(row.shippingDocs,'SHIPPER-REF');assert.equal(row.deliveredLoadNo,'BROKER-REF');assert.deepEqual(s,before);
  assert.deepEqual(next.signatureByDay,before.signatureByDay);assert.deepEqual(next.manualMilesByDay,before.manualMilesByDay);assert.deepEqual(next.eventsByDay[pickupDay],before.eventsByDay[pickupDay]);
});
test('the completed load is present on delivery day and absent the following day, including after reload',()=>{
  const {next}=apply(fixture()),reloaded=JSON.parse(JSON.stringify(next));
  assert.equal(routeLegsForDayCanonical(reloaded,day).length,1);assert.equal(routeLegsForDayCanonical(reloaded,'2026-09-13').length,0);
  const shown=shipmentContextForEvents(reloaded,day,reloaded.eventsByDay[day],routeLegsForDayCanonical(reloaded,day));
  assert.ok(!shown.find(row=>row.id==='empty').shipmentContextV110367);assert.equal(next.loadInfo.currentMoveKind,'empty/reposition');assert.equal(next.loadInfo.shippingDocs,'');
});
test('one recorded active shipment is the visible default even with a different entered broker reference',()=>{
  const s=fixture();assert.equal(deliveryRouteChoices(s,at)[0].id,'shipment');
  assert.equal(prepareDeliveryPayload(s,{...payload,deliveryRouteId:''},at).deliveryRouteId,'shipment');
});
test('ambiguous active loads require a choice; GPS city cannot select another load',()=>{
  const s=fixture();s.routeLegsByDay[pickupDay].push({...s.routeLegsByDay[pickupDay][0],id:'other',pickupEventId:'other-pickup',loadNo:'OTHER',shippingDocs:'OTHER'});
  s.eventsByDay[pickupDay].push({...s.eventsByDay[pickupDay][0],id:'other-pickup',shippingDocs:'OTHER'});
  assert.equal(deliveryRouteChoices(s,at).length,2);
  assert.throws(()=>prepareDeliveryPayload(s,{...payload,deliveryRouteId:''},at),/Choose the load/);
  assert.equal(deliveryRouteMatch(s,{...payload,deliveryRouteId:'',city:'Omaha'},at),null);
});
test('canceled, empty, planned and future shipments cannot become the delivery default',()=>{
  for(const change of [{status:'cancelled'},{kind:'empty/reposition'},{pickupDay:'2026-09-20'}, {pickupEventId:'missing'}]){
    const s=fixture();Object.assign(s.routeLegsByDay[pickupDay][0],change);
    if(change.pickupDay)s.eventsByDay['2026-09-20']=s.eventsByDay[pickupDay],delete s.eventsByDay[pickupDay];
    assert.equal(deliveryRouteChoices(s,at).length,0,JSON.stringify(change));
  }
});
test('a stale explicit selection is rejected after another device completed the route',()=>{
  const s=fixture();s.routeLegsByDay[pickupDay][0].status='delivered';assert.throws(()=>prepareDeliveryPayload(s,payload,at),/selected load changed/);
});
test('editing an existing delivery resolves its original link without creating another route',()=>{
  const s=apply(fixture()).next;assert.equal(deliveryRouteMatch(s,{status:'ON',reason:'Delivery / Unloading'}, {...at,eventId:'unload'}).id,'shipment');
});
test('generic trailer drops and pickup activities do not complete freight',()=>{
  for(const reason of ['Drop Trailer','Drop & Hook','Hook / Pickup Trailer','Pickup / Loading']){
    const s=fixture(),p={...payload,reason,note:reason,reasons:[reason]};
    assert.equal(prepareDeliveryPayload(s,p,at),p);assert.equal(completeDeliveryRoute(s.routeLegsByDay,day,p,'drop',887,s),null);
  }
});
test('reviewed aliases can identify a legacy delivery without relying on a destination match',()=>{
  const s=fixture();s.freightReferencesV110445=[{loadNo:'BROKERREF',aliases:['SHIPPERREF'],pickupDay}];
  assert.equal(deliveryRouteMatch(s,{...payload,deliveryRouteId:''},at).id,'shipment');
});
test('delivery with no recorded pickup remains a delivery without inventing a pickup',()=>{
  const p=prepareDeliveryPayload({eventsByDay:{},routeLegsByDay:{}},{...payload,deliveryRouteId:''},at);assert.equal(p.deliveryRouteId,'');assert.equal(p.deliveryCompleted,true);
  assert.equal(completeDeliveryRoute({},day,p,'unload',887),null);
});
test('multi-stop unloading completes only its chosen stop and retains the next stop',()=>{
  const s=fixture(),first=s.routeLegsByDay[pickupDay][0];Object.assign(first,{loadGroupId:'guide',stopSequence:1});
  s.routeLegsByDay[pickupDay].push({...first,id:'stop-two',pickupEventId:'',stopSequence:2,toCity:'Chicago',toState:'IL'});
  s.activeLoadGuideId='guide';s.loadInfo.guideId='guide';s.loadGuidesById={guide:{id:'guide',status:'active',loadNo:'BROKER-REF',stops:[{id:'one',type:'delivery',city:'Omaha',state:'NE'},{id:'two',type:'delivery',city:'Chicago',state:'IL'}]}};
  const {next}=apply(s);assert.equal(next.routeLegsByDay[pickupDay][0].status,'delivered');assert.equal(next.routeLegsByDay[pickupDay][1].status,'open');assert.equal(next.loadGuidesById.guide.status,'active');assert.equal(next.activeLoadGuideId,'guide');
});
test('final multistop unloading completes the guide after every delivery stop is done',()=>{
  const s=fixture(),row=s.routeLegsByDay[pickupDay][0];Object.assign(row,{loadGroupId:'guide',stopSequence:2});
  s.routeLegsByDay[pickupDay].unshift({...row,id:'first',status:'delivered',deliveryDay:'2026-09-11',deliveryEventId:'earlier',stopSequence:1});
  s.loadGuidesById={guide:{id:'guide',status:'active',loadNo:'BROKER-REF',deliveryCount:2}};s.activeLoadGuideId='guide';s.loadInfo.guideId='guide';
  const {next}=apply(s);assert.equal(next.loadGuidesById.guide.status,'completed');assert.equal(next.activeLoadGuideId,'');
});
test('the actual status handler preserves delivery metadata through its callback',()=>{
  const app=fs.readFileSync('source/src/app/App.jsx','utf8'),sheet=fs.readFileSync('source/src/modules/status/StatusWorkflowSheet.jsx','utf8');
  assert.match(app,/deliveryCompleted=false, \.\.\.deliveryDetails/);assert.match(app,/const loadPayload = \{ \.\.\.confirmedDelivery/);
  assert.match(app,/completeDeliveryRoute\(routeLegsByDay/);assert.match(app,/finishDeliveryState\(next, loadPayload, eventId\)/);
  assert.match(sheet,/aria-label="Load to complete"/);assert.match(sheet,/prepareDeliveryPayload\(state,payload\(\)/);
});

test('the real App route command updates the original pickup instead of adding a delivery-only duplicate',()=>{
  const source=fs.readFileSync('source/src/app/App.jsx','utf8');
  const from=source.indexOf('  function updateRouteLegsForStatus('),to=source.indexOf('  function buildLoadPatchForStatusPayload(',from);
  const parser=source.slice(source.indexOf('  function parseCityStateInput('),source.indexOf('  function routeLegArray('));
  const update=new Function('completeDeliveryRoute','isPickupReason','isDeliveryReason','normalizeRouteLeg','upsertRouteLeg',parser+source.slice(from,to)+';return updateRouteLegsForStatus;')(
    completeDeliveryRoute,r=>/\b(pickup|loading)\b/i.test(r),r=>/delivery|unloading/i.test(r),x=>x,()=>{throw Error('Unexpected new route');});
  const s=fixture(),p=prepareDeliveryPayload(s,payload,at),result=update(s.routeLegsByDay,day,p,event.id,at.minute,s);
  assert.equal(Object.values(result).flat().length,1);assert.equal(result[pickupDay][0].deliveryEventId,event.id);assert.equal(result[pickupDay][0].status,'delivered');
});

test('duplicate mirrored revisions resolve to the newest route before selection',()=>{
  const s=fixture();s.routeLegsByDay[pickupDay][0].updatedAt=1;
  s.routeLegsByDay.duplicate=[{...s.routeLegsByDay[pickupDay][0],updatedAt:2}];
  assert.equal(deliveryRouteMatch(s,payload,at).id,'shipment');
  const next=apply(s).next;
  assert.ok(Object.values(next.routeLegsByDay).flat().every(leg=>leg.status==='delivered'));
  assert.equal(routeLegsForDayCanonical(next,'2026-09-13').length,0);
});
