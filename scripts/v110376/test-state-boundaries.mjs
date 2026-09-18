import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';

register(new URL('../test-jsx-loader.mjs', import.meta.url));

const { formSummary } = await import('../../source/src/modules/logbook/DayLogScreen.jsx');
const { resolveGpsPosition } = await import('../../source/src/core/gps/locationService.js');
const { GET: reverseLocation } = await import('../../app/api/location/reverse/route.js');

const day='2026-09-14';
const pickup={
  id:'pickup-324',status:'ON',startMin:1236,endMin:1247,
  city:'Downers Grove',state:'IL',note:'Hook / Pickup Trailer · Trailer 904',
  description:'Load 324 · To New York, NY',shippingDocs:'324',loadNo:'324',bol:'324',
  destination:'New York, NY',destinationState:'NY',loadDetailsExplicit:true,source:'live_status'
};
const drive={id:'drive',status:'D',startMin:1247,endMin:1440,city:'Downers Grove',state:'IL',note:'Driving started',source:'live_status'};
const staleGlobal={
  loadNo:'CHARLESTON-OLD',shippingDocs:'CHARLESTON-OLD',bol:'CHARLESTON-OLD',
  pickupCity:'Charleston',pickupState:'SC',deliveryCity:'Elsewhere',deliveryState:'GA',
  notes:'stale global load note',sourceEventDay:'2026-09-18',sourceEventId:'future-pickup'
};
const base={
  activeDay:day,
  eventsByDay:{[day]:[drive]},
  routeLegsByDay:{},
  loadInfo:staleGlobal,
  equipment:{type:'dry_van',trailer:'904'},
  currentTrailer:'904',
  driver:{truck:'228',trailer:'904'},
  driverProfile:{name:'Arben Oruci'},
  signatureByDay:{},
  manualMilesByDay:{},
  carrierName:'Narta Express LLC',
  mainOfficeAddress:'Willowbrook, IL',
  homeTerminalAddress:'Willowbrook, IL',
};

let count=0;
async function test(name,fn){await fn();count+=1;console.log('PASS — '+name);}

await test('historical Form cannot inherit a global current load',()=>{
  const before=structuredClone(base);
  const form=formSummary(base,base.eventsByDay[day]);
  assert.equal(form.shippingDocs,'None');
  assert.equal(form.from,'None');
  assert.equal(form.to,'None');
  assert.equal(form.notes,'None');
  assert.deepEqual(base,before);
});

await test('recorded day evidence wins while stale global load stays isolated',()=>{
  const state=structuredClone(base);
  state.eventsByDay[day]=[pickup,drive];
  state.routeLegsByDay[day]=[{
    id:'leg-pickup-324',day,pickupDay:day,pickupEventId:'pickup-324',pickupMin:1236,
    fromCity:'Downers Grove',fromState:'IL',toCity:'New York',toState:'NY',
    shippingDocs:'324',loadNo:'324',status:'open',source:'pickup_event'
  }];
  const form=formSummary(state,state.eventsByDay[day]);
  assert.equal(form.shippingDocs,'324');
  assert.equal(form.from,'Downers Grove, IL');
  assert.equal(form.to,'New York, NY');
  assert.doesNotMatch(JSON.stringify(form),/Charleston/i);
});

await test('GPS state-only response never promotes a county subdivision to city',async()=>{
  // This reproduces the supplied day backup shape: a valid northern-Indiana
  // coordinate must not be paired with an unrelated township/city label.
  const position={coords:{latitude:41.731322192704475,longitude:-85.84835202918877,accuracy:2},timestamp:1};
  const result=await resolveGpsPosition(position,{fetchImpl:async()=>({
    ok:true,
    json:async()=>({city:'',state:'IN',source:'us-census-state-only',localityKind:'county_subdivision',subdivision:'Washington'})
  })});
  assert.equal(result.state,'IN');
  assert.equal(result.city,'GPS');
  assert.equal(result.source,'us-census-state-only');
  assert.notEqual(result.city,'Washington');
});

const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>({
  ok:true,
  json:async()=>({result:{geographies:{
    'County Subdivisions':[{BASENAME:'Washington',STUSAB:'IN'}],
    'States':[{STUSAB:'IN'}]
  }}})
});
const response=await reverseLocation(new Request('http://localhost/api/location/reverse?lat=41.731322&lng=-85.848352'));
const body=await response.json();
assert.equal(response.status,200);
assert.equal(body.city,'');
assert.equal(body.state,'IN');
assert.equal(body.localityKind,'county_subdivision');
assert.equal(body.subdivision,'Washington');
globalThis.fetch=originalFetch;
console.log('PASS — county subdivision is never returned as city');
count+=1;

await test('generic load metadata save is fenced from RODS writes',()=>{
  const source=fs.readFileSync('source/src/app/App.jsx','utf8');
  const start=source.indexOf('function saveLoadInfo(payload = {})');
  const end=source.indexOf('\n  function saveDayDistance',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/logDayEdit = false/);
  assert.match(block,/docsKey && logDayEdit/);
  assert.match(block,/syncLinkedRouteDetails && logDayEdit/);
  assert.match(block,/changesCertifiedRouteOrDocs = logDayEdit &&/);
  assert.doesNotMatch(block,/next\.currentLocation\s*=/);
});

await test('paper Form route edits declare exact log-day scope',()=>{
  const source=fs.readFileSync('source/src/modules/logbook/DayLogScreen.jsx','utf8');
  assert.match(source,/logDayEdit:true, pickupCity/);
  assert.match(source,/logDayEdit:true, deliveryCity/);
  assert.match(source,/logDayEdit:true, shippingDocs/);
  assert.match(source,/logDayEdit:true, routeLegsByDay/);
});

await test('GPS provenance survives the Status save',()=>{
  const source=fs.readFileSync('source/src/modules/status/StatusWorkflowSheet.jsx','utf8');
  assert.match(source,/locationSource: gpsFix \? \(gpsFix\.source \|\| 'gps'\) : 'manual'/);
});

console.log(count+' state-boundary regression groups passed');
