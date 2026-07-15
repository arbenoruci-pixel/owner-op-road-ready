import assert from 'node:assert/strict';
import { primaryRouteReferencesV107, repairBusinessStoreV107, repairRoadReadyStateV107 } from '../source/src/core/integrity/logbookIntegrityV107.js';

const guide = {
  id:'load_guide_391912', loadNo:'391912', orderNo:'391912', legNo:'395851', status:'active', rate:4800,
  broker:'H & N Logistics, LLC', carrierName:'Narta Express LLC', mcNumber:'MC871792', equipment:'Reefer', pickupNumber:'5010037538',
  pickupDate:'2026-07-14', deliveryDate:'2026-07-17', completedStopIds:[], documents:{}, manualDone:{},
  stops:[
    { type:'pickup', city:'Rochelle', state:'IL', date:'2026-07-14', time:'00:00' },
    { type:'delivery', city:'Mounds View', state:'MN', date:'2026-07-15', time:'06:00', poNumber:'26144210' },
    { type:'delivery', city:'Brooklyn Center', state:'MN', date:'2026-07-15', time:'12:00', poNumber:'2792' },
    { type:'delivery', city:'Rogers', state:'MN', date:'2026-07-16', time:'07:00', poNumber:'26150893478' },
    { type:'delivery', city:'Saint Cloud', state:'MN', date:'2026-07-17', time:'06:00', poNumber:'4929910' },
    { type:'delivery', city:'Rice', state:'MN', date:'2026-07-17', time:'09:00', poNumber:'26242159510' },
  ],
  steps:[{ id:'pretrip', kind:'status', title:'Complete pre-trip inspection', detail:'Rochelle, IL', city:'Rochelle', state:'IL' }],
};

const state = {
  view:'backup', activeDay:'2026-07-08', activeLoadGuideId:guide.id,
  loadGuidesById:{ [guide.id]:guide },
  loadInfo:{ guideId:guide.id, loadNo:'391912', shippingDocs:'391912', bol:'391912', po:'391912', appointment:'Mon, Jul 6, 06:30 EDT', sourceEventDay:'2026-07-14', sourceEventId:'pickup391912' },
  certifyStatus:{ '2026-07-08':'Certified', '2026-07-10':'Certified', '2026-07-14':'Needs signature', '2026-07-15':'Active day / Not certified yet' },
  signatureByDay:{ '2026-07-08':{ signed:true, signedAt:1 }, '2026-07-10':{ signed:true, signedAt:2, needsRecertification:true, changedAfterSignAt:3 } },
  inspectionByDay:{
    '2026-07-05':{ complete:true, source:'auto_on_duty_pretrip_event', sourceEventId:'wrong_off', sourceStartMin:1383 },
    '2026-07-10':{ complete:true, source:'auto_on_duty_pretrip_event', sourceEventId:'wrong_drive', sourceStartMin:0 },
  },
  eventsByDay:{
    '2026-07-05':[
      { id:'pretrip5', status:'ON', startMin:1115, endMin:1120, city:'Bristol', state:'IN', note:'Pre-trip inspection' },
      { id:'wrong_off', status:'OFF', startMin:1383, endMin:1440, city:'Maumee', state:'OH', note:'Off Duty' },
    ],
    '2026-07-08':[
      { id:'drive8', status:'D', startMin:1431, endMin:1440, city:'Wilmington', state:'IL', note:'Driving started' },
      { id:'fuel8', status:'ON', startMin:1439, endMin:1440, city:'Wilmington', state:'IL', note:'Fuel' },
    ],
    '2026-07-10':[
      { id:'wrong_drive', status:'D', startMin:0, endMin:80, city:'Youngstown', state:'OH', note:'Driving' },
      { id:'pretrip10', status:'ON', startMin:680, endMin:700, city:'Cheshire', state:'CT', note:'ON DUTY', description:'pre trip inspection delivery', shippingDocs:'607', loadNo:'607' },
    ],
    '2026-07-13':[
      { id:'delivery6273', status:'ON', startMin:0, endMin:2, city:'Batavia', state:'IL', note:'On Duty', shippingDocs:'6273', loadNo:'6273', bol:'6273' },
    ],
    '2026-07-14':[
      { id:'pretrip14', status:'ON', startMin:547, endMin:562, city:'Chicago', state:'IL', note:'Pre-trip inspection' },
      { id:'pickup391912', status:'ON', startMin:724, endMin:774, city:'Rochelle', state:'IL', note:'On Duty', description:'BOL 6473 · To Mounds View, MN', shippingDocs:'391912', loadNo:'391912', bol:'391912' },
    ],
    '2026-07-15':[{ id:'sb15', status:'SB', startMin:0, endMin:400, city:'Mounds View', state:'MN', note:'Sleeper Berth' }],
  },
  routeLegsByDay:{
    '2026-07-08':[{ id:'old607', day:'2026-07-08', pickupDay:'2026-07-08', fromCity:'willmington', fromState:'IL', toCity:'chashier', toState:'CT', loadNo:'607', shippingDocs:'607', status:'open', source:'manual_form' }],
    '2026-07-10':[{ id:'batavia_main', day:'2026-07-10', pickupDay:'2026-07-10', fromCity:'East Hartford', fromState:'CT', toCity:'Batavia', toState:'IL', loadNo:'6273', shippingDocs:'6273', status:'open', source:'manual_form_multistop', loadGroupId:'old_group', stopSequence:2 }],
    '2026-07-12':[{ id:'batavia_duplicate', day:'2026-07-12', pickupDay:'2026-07-12', fromCity:'Greenwood', fromState:'IN', toCity:'Batavia', toState:'IL', loadNo:'6273', shippingDocs:'6273', status:'open', source:'manual_form' }],
    '2026-07-13':[{ id:'batavia_zero', day:'2026-07-13', pickupDay:'2026-07-13', fromCity:'Batavia', fromState:'IL', toCity:'Batavia', toState:'IL', loadNo:'6273', shippingDocs:'6273', status:'open', source:'pickup_event', pickupEventId:'delivery6273' }],
    '2026-07-14':[
      ...[1,2,3,4,5].map(sequence => ({ id:`${guide.id}_leg_${sequence}`, loadGroupId:guide.id, day:'2026-07-14', pickupDay:'2026-07-14', deliveryDay:sequence < 3 ? '2026-07-15' : sequence === 3 ? '2026-07-16' : '2026-07-17', stopSequence:sequence, loadNo:'391912', shippingDocs:'391912', status:'planned', source:'rate_confirmation_guide_v103' })),
      { id:'pickup_duplicate', day:'2026-07-14', pickupDay:'2026-07-14', pickupEventId:'pickup391912', fromCity:'Rochelle', fromState:'IL', toCity:'Rice', toState:'MN', loadNo:'391912', shippingDocs:'391912', pickedUpLoadNo:'6473', transitionLoadNos:['6473'], status:'open', source:'pickup_event' },
    ],
  },
  documentsByDay:{ '2026-07-14':[{ id:'ratecon', type:'rate_confirmation', loadNo:'391912' }] },
};

const repaired = repairRoadReadyStateV107(state, { nowDay:'2026-07-15', repairNavigation:true, source:'test_v107' });
assert.equal(repaired.view, 'logbook');
assert.equal(repaired.activeDay, '2026-07-15');
assert.equal(repaired.eventsByDay['2026-07-08'][0].endMin, 1439);
assert.equal(repaired.certifyStatus['2026-07-08'], 'Needs Recertification');
assert.equal(repaired.certifyStatus['2026-07-10'], 'Needs Recertification');
assert.equal(repaired.inspectionByDay['2026-07-05'].sourceEventId, 'pretrip5');
assert.equal(repaired.inspectionByDay['2026-07-10'].sourceEventId, 'pretrip10');
assert.equal(repaired.routeLegsByDay['2026-07-08'][0].status, 'delivered');
assert.equal(repaired.routeLegsByDay['2026-07-10'][0].status, 'delivered');
assert.equal(repaired.routeLegsByDay['2026-07-12'][0].status, 'superseded');
assert.equal(repaired.routeLegsByDay['2026-07-13'][0].status, 'superseded');
assert.match(repaired.eventsByDay['2026-07-13'][0].note, /Delivery/);
assert.deepEqual(Object.entries(repaired.routeLegsByDay).flatMap(([day, legs]) => legs.filter(leg => leg.loadGroupId === guide.id).map(leg => [leg.stopSequence, day])), [
  [1,'2026-07-14'], [2,'2026-07-15'], [3,'2026-07-15'], [4,'2026-07-16'], [5,'2026-07-17'],
]);
assert.ok(!Object.values(repaired.routeLegsByDay).flat().some(leg => leg.id === 'pickup_duplicate'));
assert.equal(repaired.loadInfo.loadNo, '391912');
assert.equal(repaired.loadInfo.bol, '');
assert.equal(repaired.loadInfo.po, '');
assert.equal(repaired.loadInfo.nextStop, 'Mounds View, MN');
assert.match(repaired.eventsByDay['2026-07-14'].find(event => event.id === 'pickup391912').description, /Load 391912/);
assert.ok(!/6473/.test(repaired.eventsByDay['2026-07-14'].find(event => event.id === 'pickup391912').description));
assert.deepEqual(primaryRouteReferencesV107({ loadNo:'391912', orderNo:'391912', legNo:'395851', po:'26144210' }), ['391912','395851']);

const business = repairBusinessStoreV107({
  loads:[{ id:'load', loadNo:'391912', status:'booked' }],
  documents:[{ id:'weak', type:'bol', loadNo:'6273', confidence:.48, source:'smart_scan', linkDay:'' }],
}, repaired);
assert.equal(business.loads[0].status, 'in_progress');
assert.equal(business.documents[0].status, 'needs_review');
assert.equal(business.documents[0].loadNo, '');

console.log('verify-logbook-integrity-v107 passed');
