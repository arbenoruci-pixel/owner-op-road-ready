import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDotOfficerCheck} from '../../source/src/core/dot/dotOfficerCheckEngine.js';
import {applyLogbookEditorEdit} from '../../source/src/modules/logbook/eventEditingV110.js';
const day='2026-10-21';
const event={id:'pickup',status:'ON',startMin:1161,endMin:1239,city:'Example City',state:'IL',note:'Drop Load / Trailer · Hook / Pickup Trailer',bol:'00787889',destination:'Dayton, NJ',lat:41.2,lng:-87.1,locationSource:'gps',loadNo:'BROKER-1',po:'PO-1'};
const state=e=>({activeDay:day,homeTerminalTimeZone:'America/New_York',eventsByDay:{[day]:[{id:'rest',status:'OFF',startMin:0,endMin:1161,city:'Example City',state:'IL'},e,{id:'after',status:'OFF',startMin:1239,endMin:1440,city:'Example City',state:'IL'}]},routeLegsByDay:{},signatureByDay:{[day]:'preserved-signature'},certifyStatus:{[day]:'Signed'},manualMilesByDay:{[day]:200},inspectionByDay:{},loadInfo:{}});
const pickupIssues=s=>buildDotOfficerCheck(s,day).issues.filter(i=>i.id.startsWith('pickup_route_'));
for(const [name,fields,action] of [
 ['canonical BOL only',{loadNo:'',shippingDocs:''},null],
 ['legacy shipping reference',{bol:'',loadNo:'',shippingDocs:'LEGACY'},null],
 ['whitespace legacy field',{bol:'00787889',shippingDocs:' ',loadNo:''},null],
 ['missing BOL',{bol:'',shippingDocs:'',loadNo:''},'Add BOL'],
 ['missing destination',{destination:'',destinationState:''},'Add destination'],
 ['destination city field',{destination:'',destinationCity:'Dayton',destinationState:'NJ'},null]
])test(name+' is checked without changing records',()=>{
 const s=state({...event,...fields}),before=structuredClone(s),issues=pickupIssues(s);
 assert.deepEqual(issues.map(i=>i.actionLabel),action?[action]:[]);assert.deepEqual(s,before);
});
test('an exact linked route BOL satisfies pickup; unrelated route does not',()=>{
 const s=state({...event,bol:'',loadNo:'',destination:''});
 s.routeLegsByDay[day]=[{id:'leg',day,pickupDay:day,pickupEventId:'other',bol:'ROUTE-BOL',toCity:'Dayton',toState:'NJ',status:'open'}];
 assert.equal(pickupIssues(s).length,1);s.routeLegsByDay[day][0].pickupEventId=event.id;assert.equal(pickupIssues(s).length,0);
});
test('explicit BOL edit retains broker, PO, times, GPS, signature and audit copy',()=>{
 const s=state(event);
 const linked={id:'linked',day,pickupDay:day,pickupEventId:event.id,source:'pickup_event',status:'open',loadNo:'BROKER-1',bol:event.bol,po:'ROUTE-PO',shippingDocs:'DISTINCT-SHIPPER'};
 const unlinked={...linked,id:'unlinked',pickupEventId:'other'};
 s.routeLegsByDay[day]=[linked,unlinked];
 const before=structuredClone(s),result=applyLogbookEditorEdit(s,{day,id:event.id,expected:event,patch:{bol:'NEW-BOL',loadDetailsExplicit:true}},new Date('2026-10-25T12:00:00Z'));
 assert.equal(result.ok,true);const saved=result.state.eventsByDay[day].find(e=>e.id===event.id);
 for(const field of ['loadNo','po','startMin','endMin','status','lat','lng','locationSource'])assert.deepEqual(saved[field],event[field],field);
 assert.equal(saved.bol,'NEW-BOL');assert.deepEqual(result.state.signatureByDay,s.signatureByDay);assert.deepEqual(result.state.manualMilesByDay,s.manualMilesByDay);
 assert.deepEqual(result.state.routeLegsByDay[day],[{...linked,bol:'NEW-BOL'},unlinked]);
 assert.deepEqual(result.state.logbookEditHistoryByDay[day].at(-1).beforeEvents,before.eventsByDay[day]);assert.deepEqual(s,before);
});
