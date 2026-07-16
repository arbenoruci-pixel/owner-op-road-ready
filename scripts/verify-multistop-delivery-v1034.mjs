import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyDeliveryContextToPayloadV1034, repairMultiStopDeliveryStateV1034, resolveDeliveryContextV1034 } from '../source/src/modules/loads/multiStopDeliveryV1034.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const guide = {
  id:'load_guide_391912', loadNo:'391912', orderNo:'391912', legNo:'395851', status:'active', completedStopIds:['1','2'],
  pickupDate:'2026-07-14', deliveryDate:'2026-07-17',
  stops:[
    { type:'pickup', id:'pickup_1', city:'Rochelle', state:'IL', date:'2026-07-14', time:'00:00', poNumber:'26242159510' },
    { type:'delivery', id:'delivery_2', city:'Mounds View', state:'MN', date:'2026-07-15', time:'06:00', poNumber:'26144210' },
    { type:'delivery', id:'delivery_3', city:'Brooklyn Center', state:'MN', date:'2026-07-15', time:'12:00', poNumber:'2792' },
    { type:'delivery', id:'delivery_4', city:'Rogers', state:'MN', date:'2026-07-16', time:'07:00', poNumber:'26150893478' },
    { type:'delivery', id:'delivery_5', city:'SAINT CLOUD', state:'MN', date:'2026-07-17', time:'06:00', poNumber:'4929910' },
    { type:'delivery', id:'delivery_6', city:'Rice', state:'MN', date:'2026-07-17', time:'09:00', poNumber:'26242159510' },
  ],
};
const state = {
  activeLoadGuideId:guide.id,
  loadGuidesById:{ [guide.id]:guide },
  currentLocation:{ city:'Rogers', state:'MN' },
  loadInfo:{ guideId:guide.id, loadNo:'391912', deliveryCity:'Rice', deliveryState:'MN', nextStop:'Rogers, MN', sourceEventId:'rogers' },
  eventsByDay:{
    '2026-07-14':[{ id:'pickup', status:'ON', startMin:724, endMin:774, city:'Rochelle', state:'IL', note:'Pickup / Loading', shippingDocs:'391912', destination:'Mounds View, MN' }],
    '2026-07-15':[
      { id:'mounds', status:'ON', startMin:573, endMin:591, city:'Mounds View', state:'MN', note:'Pre-trip inspection · Delivery / Unloading · ON DUTY', description:'Load 391912 · To Rice, MN · At Rice, MN', shippingDocs:'395851', destination:'Brooklyn Center, MN' },
      { id:'brooklyn', status:'ON', startMin:632, endMin:647, city:'Brooklyn Center', state:'MN', note:'Delivery / Unloading', description:'Load 391912 · To Rice, MN · At Rice, MN', shippingDocs:'391912', destination:'Rogers, MN' },
    ],
    '2026-07-16':[{ id:'rogers', status:'ON', startMin:654, endMin:655, city:'Rogers', state:'MN', note:'Pre-trip inspection · Delivery / Unloading', description:'Load 391912 · To Rice, MN · At Rice, MN', shippingDocs:'391912', destination:'Rice, MN' }],
  },
  routeLegsByDay:{
    '2026-07-14':[{ id:'load_guide_391912_leg_1', loadGroupId:guide.id, loadNo:'391912', stopSequence:1, fromCity:'Rochelle', fromState:'IL', toCity:'Mounds View', toState:'MN', pickupEventId:'rogers', deliveryEventId:'rogers', status:'delivered', source:'rate_confirmation_guide_v107' }],
    '2026-07-15':[{ id:'load_guide_391912_leg_3', loadGroupId:guide.id, loadNo:'391912', stopSequence:3, fromCity:'Brooklyn Center', fromState:'MN', toCity:'Rogers', toState:'MN', status:'superseded', source:'rate_confirmation_guide_v107' }],
  },
};

const beforeCore = Object.fromEntries(Object.entries(state.eventsByDay).flatMap(([day, rows]) => rows.map(row => [row.id, { day, status:row.status, startMin:row.startMin, endMin:row.endMin, city:row.city, state:row.state }])));
const context = resolveDeliveryContextV1034(state, { city:'Rogers', state:'MN' });
assert.equal(context.currentSequence, 3);
assert.equal(context.po, '26150893478');
assert.equal(context.nextStopText, 'SAINT CLOUD, MN');
const payload = applyDeliveryContextToPayloadV1034(state, { status:'ON', reason:'Pre-trip inspection · Delivery / Unloading', city:'Rogers', state:'MN', shippingDocs:'391912', destination:'Rice, MN' });
assert.equal(payload.destination, 'Rogers, MN');
assert.equal(payload.nextStop, 'SAINT CLOUD, MN');
assert.equal(payload.po, '26150893478');
assert.equal(payload.legNo, '395851');

const repaired = repairMultiStopDeliveryStateV1034(state, { source:'test' });
assert.equal(repaired.loadInfo.pickupCity, 'Rochelle');
assert.equal(repaired.loadInfo.deliveryCity, 'Rice');
assert.equal(repaired.loadInfo.currentStop, 'Rogers, MN');
assert.equal(repaired.loadInfo.nextStop, 'SAINT CLOUD, MN');
assert.equal(repaired.loadInfo.activeStopSequence, 3);
const events = Object.values(repaired.eventsByDay).flat();
assert.match(events.find(row => row.id === 'mounds').description, /Unloading at Mounds View, MN.*Next Brooklyn Center, MN/);
assert.match(events.find(row => row.id === 'brooklyn').description, /PO 2792.*Unloading at Brooklyn Center, MN.*Next Rogers, MN/);
assert.match(events.find(row => row.id === 'rogers').description, /PO 26150893478.*Unloading at Rogers, MN.*Next SAINT CLOUD, MN/);
assert.equal(events.find(row => row.id === 'mounds').shippingDocs, '391912');
assert.equal(events.find(row => row.id === 'mounds').note, 'Pre-trip inspection · Delivery / Unloading');
const guideLegs = Object.values(repaired.routeLegsByDay).flat().filter(row => row.loadGroupId === guide.id).sort((a,b)=>a.stopSequence-b.stopSequence);
assert.deepEqual(guideLegs.map(row => row.status), ['delivered','delivered','in_progress','planned','planned']);
assert.equal(guideLegs[0].deliveryEventId, 'mounds');
assert.equal(guideLegs[2].deliveryEventId, 'rogers');
for (const row of events) {
  const before = beforeCore[row.id];
  if (!before) continue;
  for (const key of ['status','startMin','endMin','city','state']) assert.equal(row[key], before[key], `${row.id} ${key} changed`);
}

const workflow = read('source/src/modules/status/StatusWorkflowSheet.jsx');
const app = read('source/src/app/App.jsx');
assert.match(workflow,/resolveDeliveryContextV1034/);
assert.match(workflow,/Unloading at/);
assert.match(workflow,/Next stop/);
assert.match(app,/repairMultiStopDeliveryStateV1034/);
assert.match(app,/deliveryStopSequence/);
console.log('verify-multistop-delivery-v1034 passed');
