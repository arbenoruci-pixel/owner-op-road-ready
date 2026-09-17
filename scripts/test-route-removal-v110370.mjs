import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {deleteRouteLegFromState} from '../source/src/core/routes/routeLegDeletion.js';
import {applyRouteRemovals} from '../source/src/core/routes/routeRemovalV110370.js';
import {normalizeLoadInfoFromRouteLegs,routeLegsForDayCanonical,routeLegsForDayMiles} from '../source/src/core/routes/routeNormalization.js';
import {applyLogbookEditorInsert,applyLogbookEditorEdit,runExternalCommand,preserveRecordedDays} from '../source/src/modules/logbook/public-api.js';
import {repairMultiStopDeliveryStateV1034} from '../source/src/modules/loads/multiStopDeliveryV1034.js';
const day='2026-09-14',earlier='2026-09-13',later='2026-09-15',at=new Date('2026-09-17T18:00:00Z');
const pickup={id:'pickup-test',status:'ON',startMin:0,endMin:60,note:'Pickup',city:'Test Origin',state:'IL',source:'manual'};
const drive={id:'drive-test',status:'D',startMin:60,endMin:1440,note:'Driving',source:'manual'};
const route={id:'test-guide_leg_1',loadGroupId:'test-guide',day,pickupDay:day,pickupEventId:pickup.id,fromCity:'Test Origin',fromState:'IL',toCity:'Test Destination',toState:'WI',shippingDocs:'TEST-BOL',status:'open',source:'rate_confirmation_guide_v1034'};
const other={...route,id:'other-stop',day:earlier,pickupDay:earlier,pickupEventId:'other-pickup'};
const make=()=>({activeDay:day,homeTerminalTimeZone:'America/Chicago',currentStatus:'OFF',eventsByDay:{[earlier]:[{...pickup,id:'other-pickup'}],[day]:[pickup,drive]},routeLegsByDay:{[day]:[route],[earlier]:[other]},loadInfo:{routeLegsByDay:{[day]:[route]}},manualMilesByDay:{[day]:123,[earlier]:20},signatureByDay:{[day]:{signed:true,signatureDataUrl:'original'}},dotWallet:{documents:{test:'original'}},loadGuidesById:{test:{id:'test-guide',loadNo:'TEST-BOL'}},formByDay:{}});
const flat=s=>Object.values(s.routeLegsByDay||{}).flat();
let count=0;function test(name,fn){fn();count++;console.log('PASS — '+name);}
test('real legacy multi-stop repair reproduces the deleted-row resurrection and deletion intent blocks it',()=>{
 const s=make(),guide={id:'test-guide',loadNo:'TEST-BOL',status:'active',pickupDate:day,deliveryDate:later,stops:[
  {id:'p',type:'pickup',city:'Test Origin',state:'IL',date:day},
  {id:'d1',type:'delivery',city:'Test Destination',state:'WI',date:day},
  {id:'d2',type:'delivery',city:'Final Destination',state:'WI',date:later},
 ]};
 s.activeLoadGuideId=guide.id;s.loadGuidesById={[guide.id]:guide};
 const next=deleteRouteLegFromState(s,{id:route.id});
 const repaired=repairMultiStopDeliveryStateV1034(next);
 assert.ok(flat(repaired).some(r=>r.id===route.id),'reproduces the legacy regeneration path');
 assert.ok(!flat(applyRouteRemovals(repaired)).some(r=>r.id===route.id));
 assert.ok(flat(applyRouteRemovals(repaired)).some(r=>r.id==='test-guide_leg_2'),'separate next stop remains');
});
test('explicit route deletion survives a reconstructed newer guide copy and stale legacy mirror',()=>{
 const s=make(),next=deleteRouteLegFromState(s,{id:route.id});
 assert.ok(next.logbookRouteRemovalsV110370.deletedIds.includes(route.id));
 const resurrected={...JSON.parse(JSON.stringify(next)),routeLegsByDay:{...next.routeLegsByDay,[day]:[{...route,updatedAt:Date.now()+10000}]},loadInfo:{...next.loadInfo,routeLegsByDay:{[day]:[route]}}};
 assert.ok(!routeLegsForDayCanonical(resurrected,day).some(r=>r.id===route.id));
 assert.ok(!routeLegsForDayMiles(resurrected,day).some(r=>r.id===route.id));
 const normalized=normalizeLoadInfoFromRouteLegs(resurrected);
 assert.ok(!flat(normalized).some(r=>r.id===route.id));assert.ok(flat(normalized).some(r=>r.id===other.id));
 assert.equal(applyRouteRemovals(next),next);
 assert.deepEqual(next.eventsByDay,s.eventsByDay);assert.equal(next.dotWallet,s.dotWallet);
});
test('actual editor full-day OFF clears owned routes and miles and preserves other days and edit evidence',()=>{
 const s=make(),original=structuredClone(s);
 const result=applyLogbookEditorInsert(s,{day,event:{id:'rest-day',status:'OFF',startMin:0,endMin:1440,note:'Off Duty',source:'manual'}},at);
 assert.equal(result.ok,true,result.error);const next=result.state;
 assert.deepEqual(s,original);assert.ok(!flat(next).some(r=>r.id===route.id));
 assert.equal(next.manualMilesByDay[day],undefined);assert.equal(next.manualMilesByDay[earlier],20);
 assert.deepEqual(next.eventsByDay[earlier],s.eventsByDay[earlier]);assert.equal(next.dotWallet,s.dotWallet);assert.equal(next.signatureByDay,s.signatureByDay);
 assert.deepEqual(next.logbookEditHistoryByDay[day].at(-1).beforeEvents,s.eventsByDay[day]);
 assert.deepEqual(next.eventsByDay[day].filter(e=>!e.voided).map(e=>[e.status,e.startMin,e.endMin]),[['OFF',0,1440]]);
 const stored=JSON.parse(JSON.stringify(next));const reloaded=preserveRecordedDays(stored,normalizeLoadInfoFromRouteLegs(stored),'2026-09-17');
 assert.ok(!routeLegsForDayCanonical(reloaded,day).some(r=>r.id===route.id));
});
test('full-day sleeper correction excludes carried shipment only on the corrected day',()=>{
 const s=make();s.routeLegsByDay={[earlier]:[other]};s.loadInfo={};
 const next=applyLogbookEditorInsert(s,{day,event:{id:'rest-day',status:'SB',startMin:0,endMin:1440,note:'Sleeper'}},at).state;
 assert.ok(flat(next).some(r=>r.id===other.id));
 assert.ok(!routeLegsForDayCanonical(next,day).some(r=>r.id===other.id));
 assert.ok(routeLegsForDayCanonical(next,earlier).some(r=>r.id===other.id));
 assert.ok(routeLegsForDayCanonical(next,later).some(r=>r.id===other.id));
});
test('partial OFF break keeps actual load and mileage; unchanged OFF-day edits do not wipe routes',()=>{
 const s=make();const next=applyLogbookEditorInsert(s,{day,event:{id:'break',status:'OFF',startMin:120,endMin:150,note:'Off Duty'}},at).state;
 assert.equal(next.routeLegsByDay,s.routeLegsByDay);assert.equal(next.manualMilesByDay,s.manualMilesByDay);
 s.eventsByDay[day]=[{id:'off-all',status:'OFF',startMin:0,endMin:1440,note:'Off Duty',source:'manual'}];
 const edit=applyLogbookEditorEdit(s,{day,id:'off-all',patch:{city:'Updated City'}},at).state;
 assert.equal(edit.routeLegsByDay,s.routeLegsByDay);
});
test('changing a pickup to OFF removes its linked route even when the event ID is retained',()=>{
 const s=make();const result=applyLogbookEditorEdit(s,{day,id:pickup.id,patch:{status:'OFF',note:'Off Duty'}},at);
 assert.equal(result.ok,true,result.error);assert.ok(!flat(result.state).some(r=>r.id===route.id));
 assert.ok(result.state.eventsByDay[day].some(row=>row.id===pickup.id&&row.status==='OFF'));
 assert.ok(flat(result.state).some(r=>r.id===other.id));
});
test('document integration cannot discard tombstones or rewrite duty history',()=>{
 const s=deleteRouteLegFromState(make(),{id:route.id});
 const next=runExternalCommand(s,draft=>({...draft,logbookRouteRemovalsV110370:{},routeLegsByDay:{[day]:[route]}}),'documents',{});
 assert.equal(next.logbookRouteRemovalsV110370,s.logbookRouteRemovalsV110370);assert.equal(next.routeLegsByDay,s.routeLegsByDay);
});
test('actual App recertification boundary filters reconstructed routes before signing',()=>{
 const app=fs.readFileSync('source/src/app/App.jsx','utf8'),start=app.indexOf('  function markDayRecert('),end=app.indexOf('\n  function markRecert(',start);
 const fn=vm.runInNewContext(app.slice(start,end)+'\nmarkDayRecert',{applyRouteRemovals});
 const s=deleteRouteLegFromState({...make(),signatureByDay:{}},{id:route.id});
 const next=fn({...s,routeLegsByDay:{...s.routeLegsByDay,[day]:[route]}},day);
 assert.ok(!flat(next).some(r=>r.id===route.id));
});
test('full-day preset spans 24:00 and intentional Undo includes removal metadata',()=>{
 const sheet=fs.readFileSync('source/src/modules/editor/InsertEditEventSheet.jsx','utf8');
 const full=sheet.slice(sheet.indexOf('  function setFullDay('),sheet.indexOf('  function graphEvents('));
 assert.ok(full.includes('end: toInput(1440)'));assert.ok(!full.includes('1439'));
 const app=fs.readFileSync('source/src/app/App.jsx','utf8');
 assert.ok(app.slice(app.indexOf('function undoableStateSnapshot'),app.indexOf('function undoDataFingerprint')).includes('logbookRouteRemovalsV110370'));
});
console.log(count+' durable route removal groups passed');
