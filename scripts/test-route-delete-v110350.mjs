import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {routeLegDeleteRequest,deleteRouteLegFromState} from '../source/src/core/routes/routeLegDeletion.js';
import {normalizeLoadInfoFromRouteLegs,routeLegsForDayCanonical} from '../source/src/core/routes/routeNormalization.js';
import {preserveRecordedDays} from '../source/src/modules/logbook/public-api.js';
import {createCertificationRecord,certificationStatusV1032,reconcileCertificationStatusesV1032} from '../source/src/modules/logbook/certificationV110.js';
const home='2026-09-13',pickup='2026-09-14',today='2026-09-15';
const target={id:'pending-38246703',day:home,pickupDay:pickup,fromCity:'Dates Delivery Dates',toCity:'Dates',shippingDocs:'38246703',status:'open'};
const keep={id:'keep-324',day:pickup,pickupDay:pickup,fromCity:'Downers Grove',fromState:'IL',toCity:'New York',toState:'NY',shippingDocs:'324',status:'open'};
function fixture(){return {activeDay:today,routeLegsByDay:{[pickup]:[structuredClone(target),structuredClone(keep)]},loadInfo:{broker:'Test Broker',loadNo:'324'},eventsByDay:{[home]:[{id:'duty-1',status:'OFF',startMin:0,endMin:1440,city:'Chicago',state:'IL',note:'Off Duty'}],[pickup]:[],[today]:[]},signatureByDay:{},certifyStatus:{},formByDay:{},driverProfile:{name:'Test Driver'},driver:{truck:'12'},carrierName:'Example Carrier',mainOfficeAddress:'Test Office',equipment:{type:'dry_van',trailer:'TEST'},currentStatus:'OFF',loadGuidesById:{guide:{id:'guide',loadNo:'324',status:'active'}},activeLoadGuideId:'guide',dotWallet:{documents:{bol:{id:'original-bol',dataUrl:'unchanged'}}}};}
const rows=s=>Object.values(s.routeLegsByDay||{}).flat();
const test=(label,fn)=>{fn();console.log('PASS — '+label);};
const oldDelete=(s,leg)=>{const day=leg.day||s.activeDay,map={...s.routeLegsByDay};map[day]=(map[day]||[]).filter(row=>row.id!==leg.id);return normalizeLoadInfoFromRouteLegs({...s,routeLegsByDay:map});};
test('baseline reproduces wrong-bucket and legacy resurrection',()=>{
 const s=fixture();assert.ok(rows(oldDelete(s,target)).some(r=>r.id===target.id));
 s.routeLegsByDay={[home]:[target],[pickup]:[keep]};s.loadInfo.routeLegsByDay={[home]:[target]};
 assert.ok(rows(oldDelete(s,target)).some(r=>r.id===target.id));
});
test('confirmed ID removes only that route across actual storage buckets',()=>{
 const s=fixture(),before=structuredClone(s),next=deleteRouteLegFromState(s,routeLegDeleteRequest(s,target));
 assert.deepEqual(s,before);assert.deepEqual(rows(next),[keep]);
 assert.equal(next.routeLegsByDay[pickup][0],s.routeLegsByDay[pickup][1]);
 for(const key of Object.keys(s).filter(k=>k!=='routeLegsByDay'))assert.equal(next[key],s[key],key+' remains unchanged');
});
test('legacy copies stay removed after normalization, snapshot reload and history preservation',()=>{
 const s=fixture();s.routeLegsByDay[home]=[target];s.loadInfo.routeLegsByDay={[home]:[target],[pickup]:[{...keep,id:'other-legacy'}]};
 const next=deleteRouteLegFromState(s,{id:target.id});
 assert.deepEqual(next.routeLegsByDay[home],[]);assert.deepEqual(next.loadInfo.routeLegsByDay[home],[]);
 assert.equal(next.loadInfo.broker,s.loadInfo.broker);assert.equal(next.loadInfo.routeLegsByDay[pickup][0].id,'other-legacy');
 const stored=JSON.parse(JSON.stringify(next));
 const restored=preserveRecordedDays(stored,normalizeLoadInfoFromRouteLegs(stored),today);
 assert.ok(!rows(restored).some(r=>r.id===target.id));
 assert.ok(!routeLegsForDayCanonical(restored,today).some(r=>r.id===target.id));
 assert.deepEqual(restored.eventsByDay,s.eventsByDay);
});
test('shared BOL and new concurrent stops are preserved; repeat delete is a no-op',()=>{
 const s=fixture(),request=routeLegDeleteRequest(s,target),sameBol={...target,id:'same-bol-other-stop'},newStop={...keep,id:'concurrent-stop'};
 s.routeLegsByDay[pickup].push(sameBol,newStop);
 const next=deleteRouteLegFromState(s,request);assert.deepEqual(rows(next),[keep,sameBol,newStop]);
 assert.equal(deleteRouteLegFromState(next,request),next);
});
test('ID-less imports require an exact unique record; empty IDs never mass-delete',()=>{
 const s=fixture(),a={fromCity:'First',toCity:'Stop',shippingDocs:'same'},b={fromCity:'Second',toCity:'Stop',shippingDocs:'same'};
 s.routeLegsByDay={[home]:[a,b]};
 const displayed=routeLegsForDayCanonical(s,home).find(r=>r.fromCity==='First');
 const request=routeLegDeleteRequest(s,displayed);assert.ok(request);
 assert.deepEqual(deleteRouteLegFromState(s,request).routeLegsByDay[home],[b]);
 assert.equal(deleteRouteLegFromState(s,{id:''}),s);
 const changed={...s,routeLegsByDay:{[home]:[{...a,toCity:'Edited'},b]}};
 assert.equal(deleteRouteLegFromState(changed,request),changed);
 s.routeLegsByDay[home].push({...a});assert.equal(routeLegDeleteRequest(s,displayed),null);
});
test('numeric IDs and invalid requests are handled without touching neighbors',()=>{
 const s=fixture();s.routeLegsByDay[home]=[{...target,id:0},{...keep,id:9}];
 assert.deepEqual(deleteRouteLegFromState(s,routeLegDeleteRequest(s,s.routeLegsByDay[home][0])).routeLegsByDay[home],[{...keep,id:9}]);
 for(const request of [null,{},'bad',{id:'missing'}])assert.equal(deleteRouteLegFromState(s,request),s);
});
test('only affected signed days require recertification; signature evidence stays intact',()=>{
 const s=fixture();s.routeLegsByDay={[home]:[{...target,pickupDay:home,deliveryDay:pickup}], [pickup]:[keep]};
 for(const day of [home,pickup,today]){s.signatureByDay[day]=createCertificationRecord(s,day,{now:10000});s.certifyStatus[day]='Certified';}
 const next=reconcileCertificationStatusesV1032(deleteRouteLegFromState(s,{id:target.id}));
 assert.equal(certificationStatusV1032(next,home).status,'Needs Recertification');
 assert.equal(certificationStatusV1032(next,pickup).status,'Needs Recertification');
 assert.equal(certificationStatusV1032(next,today).status,'Certified');
 assert.equal(next.signatureByDay,s.signatureByDay);assert.equal(next.eventsByDay,s.eventsByDay);
});
test('materialized UI confirmation dispatches an ID command; cancellation does nothing',()=>{
 const source=fs.readFileSync('source/src/modules/logbook/DayLogScreen.jsx','utf8');
 const start=source.indexOf('  function deleteRouteLeg(leg) {'),end=source.indexOf('\n  return (',start);
 assert.ok(start>=0&&end>start);const calls=[];let accepted=false;
 const context={state:fixture(),legLabel:()=> 'Test route',routeLegDeleteRequest,onSaveLoad:p=>calls.push(p),window:{confirm:()=>accepted,alert:()=>{throw Error('unexpected alert');}}};
 const click=vm.runInNewContext(source.slice(start,end)+'\ndeleteRouteLeg',context);
 click(target);assert.equal(calls.length,0);accepted=true;click(target);
 assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{deleteRouteLeg:{id:target.id}}]);
 assert.ok(!Object.hasOwn(calls[0],'routeLegsByDay'));
});
test('materialized App reducer uses latest state and bypasses unrelated load normalization',()=>{
 const source=fs.readFileSync('source/src/app/App.jsx','utf8');
 const start=source.indexOf('  function saveLoadInfo(payload = {}) {'),end=source.indexOf('\n  function saveDayDistance(',start);
 assert.ok(start>=0&&end>start);let state=fixture();
 const savedGuide=state.loadGuidesById,savedDocs=state.dotWallet;
 const save=vm.runInNewContext(source.slice(start,end)+'\nsaveLoadInfo',{setState:fn=>{state=fn(state);},deleteRouteLegFromState,reconcileCertificationStatusesV1032});
 state.routeLegsByDay[pickup].push({...keep,id:'arrived-after-render'});
 save({deleteRouteLeg:{id:target.id}});
 assert.deepEqual(rows(state).map(r=>r.id),[keep.id,'arrived-after-render']);
 assert.equal(state.loadGuidesById,savedGuide);assert.equal(state.dotWallet,savedDocs);
 assert.ok(!Object.hasOwn(state.loadInfo,'deleteRouteLeg'));
});
console.log('9 route deletion regressions passed');
