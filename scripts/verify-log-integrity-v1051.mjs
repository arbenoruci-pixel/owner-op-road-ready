import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repairLogIntegrityV1051 } from '../source/src/modules/logbook/logIntegrityV1051.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const event = (id, status, startMin, endMin, city, state, note, extra = {}) => ({
  id, status, startMin, endMin, city, state, note, description:'', source:'live_status',
  shippingDocs:'', loadNo:'', bol:'', po:'', destination:'', destinationState:'',
  ...extra,
});

const state = {
  currentLocation:{ city:'Chicago', state:'UNK', locationSource:'manual' },
  loadInfo:{
    loadNo:'178564', shippingDocs:'178564', bol:'178564', po:'178564',
    pickupCity:'Sherman', pickupState:'IL', deliveryCity:'', deliveryState:'',
    stopCount:1, deliveryCount:1, stops:[],
  },
  activeLoadGuideId:'',
  loadGuidesById:{
    load_guide_391912:{
      id:'load_guide_391912', loadNo:'391912', orderNo:'391912', broker:'H & N Logistics, LLC',
      rate:4800, status:'completed', deliveryCount:5, completedStopIds:['1','2','3','4','5'],
      poNumbers:['26144210','2792','26150893478','4929910','26242159510'],
      stops:[
        { id:'pickup_1', type:'pickup', city:'Rochelle', state:'IL' },
        { id:'delivery_2', type:'delivery', city:'Mounds View', state:'MN' },
        { id:'delivery_3', type:'delivery', city:'Brooklyn Center', state:'MN' },
        { id:'delivery_4', type:'delivery', city:'Rogers', state:'MN' },
        { id:'delivery_5', type:'delivery', city:'St. Cloud', state:'MN' },
        { id:'delivery_6', type:'delivery', city:'Rice', state:'MN' },
      ],
    },
    load_guide_98306:{
      id:'load_guide_98306', loadNo:'98306', status:'active',
      stops:[
        { id:'pickup_1', type:'pickup', city:'on: 2026-07-17', state:'' },
        { id:'delivery_1', type:'delivery', city:'Date: 2026-07-18', state:'' },
      ],
    },
  },
  routeLegsByDay:{
    '2026-07-05':[
      { id:'pickup111_leg', loadNo:'111Y7Z983', pickupEventId:'pickup111', deliveryEventId:'transfer111', status:'delivered', fromCity:'Chicago', toCity:'Bristol' },
    ],
    '2026-07-13':[
      { id:'delivery6273_leg', loadNo:'6273', deliveryEventId:'delivery6273', status:'delivered', fromCity:'East Hartford', toCity:'Batavia' },
      { id:'superseded6273', loadNo:'6273', pickupEventId:'delivery6273', status:'superseded', fromCity:'Batavia', toCity:'Batavia' },
    ],
    '2026-07-17':[
      { id:'load_guide_98306_leg_1', loadGroupId:'load_guide_98306', loadNo:'98306', bol:'98306', po:'98306', status:'planned', fromCity:'on: 2026-07-17', toCity:'Date: 2026-07-18' },
    ],
    '2026-07-18':[
      { id:'leg_live_1784386205330', loadNo:'178564', bol:'178564', po:'178564', pickupEventId:'pickup178', status:'open', fromCity:'Sherman', toCity:'' },
    ],
  },
  eventsByDay:{
    '2026-07-05':[
      event('pickup111','ON',862,885,'Chicago','IL','Drop & Hook · Pre-trip inspection · Load 111Y7Z983 · to Bristol, IN',{
        loadNo:'111Y7Z983', shippingDocs:'111Y7Z983', deliveredLoadNo:'111Y7Z983', pickedUpLoadNo:'111Y7Z983',
        transitionLoadNos:['111Y7Z983'], transitionSummary:'Delivered 111Y7Z983 · Picked up 111Y7Z983',
      }),
      event('transfer111','ON',1109,1110,'Bristol','IN','Drop & Hook · delivered 111Y7Z983 · picked up 111J98KGR',{
        deliveredLoadNo:'111Y7Z983', pickedUpLoadNo:'111J98KGR',
        transitionLoadNos:['111Y7Z983','111J98KGR'], transitionSummary:'Delivered 111Y7Z983 · Picked up 111J98KGR',
      }),
    ],
    '2026-07-13':[
      event('delivery6273','ON',0,2,'Batavia','IL','Delivery / Unloading',{
        loadNo:'6273', shippingDocs:'6273', bol:'6273', deliveredLoadNo:'6273', pickedUpLoadNo:'6273',
        transitionLoadNos:['6273'], transitionSummary:'Delivered 6273 · Picked up 6273',
      }),
    ],
    '2026-07-14':[
      event('pickup391','ON',724,774,'Rochelle','IL','Pickup / Loading',{
        loadNo:'391912', shippingDocs:'391912', bol:'26144210', po:'26242159510',
        destination:'Rice, MN', destinationState:'MN', nextStop:'Mounds View, MN',
        pickedUpLoadNo:'391912', transitionLoadNos:['391912'], transitionSummary:'Picked up 391912',
        shippingDocumentId:'wrong_pod', shippingDocumentType:'pod', shippingDocumentDate:'2026-07-14',
        documentIds:['rate391','wrong_pod'], rateConfirmationDocumentId:'rate391',
        shipmentWeight:20188, shipmentPieces:0, consignee:'WRONG RECEIVER',
      }),
    ],
    '2026-07-15':[
      event('stop1','ON',573,591,'Mounds View','MN','Delivery / Unloading',{
        loadNo:'391912', shippingDocs:'391912', po:'26144210', deliveryStopSequence:1, deliveryStopCount:5,
        pickedUpLoadNo:'391912', transitionLoadNos:['391912'], transitionSummary:'Picked up 391912',
      }),
    ],
    '2026-07-16':[
      event('stop3','ON',654,700,'Rogers','MN','Delivery / Unloading',{
        loadNo:'391912', shippingDocs:'391912', po:'26150893478', deliveryStopSequence:3, deliveryStopCount:5,
        deliveredLoadNo:'391912', pickedUpLoadNo:'391912', transitionLoadNos:['391912'], transitionSummary:'Picked up 391912',
      }),
    ],
    '2026-07-17':[
      event('stop4','ON',228,246,'St. Cloud','MN','Delivery / Unloading',{
        loadNo:'391912', shippingDocs:'391912', bol:'98306', po:'4929910', deliveryStopSequence:4, deliveryStopCount:5,
        deliveredLoadNo:'98306', pickedUpLoadNo:'98306', transitionLoadNos:['98306','391912'],
        transitionSummary:'Delivered 98306 · Picked up 98306', displayShippingDocs:'Delivered 98306 · Picked up 98306',
        rateConfirmationDocumentId:'rate98306', documentIds:['rate98306'], loadRate:1900, broker:'',
      }),
      event('stop5','ON',281,324,'Rice','MN','Delivery / Unloading',{
        loadNo:'391912', shippingDocs:'391912', po:'26242159510', deliveryStopSequence:5, deliveryStopCount:5,
        pickedUpLoadNo:'391912', transitionLoadNos:['391912'], transitionSummary:'Picked up 391912',
      }),
      event('pickup98306','ON',495,580,'Lakeville','MN','Pickup / Loading',{
        loadNo:'98306', shippingDocs:'98306', bol:'98306', destination:'Date: 2026-07-18',
        pickedUpLoadNo:'98306', transitionLoadNos:['98306'], transitionSummary:'Picked up 98306',
      }),
      event('lastOff17','OFF',1235,1440,'Chicago','IL','Off Duty'),
    ],
    '2026-07-18':[
      event('pretrip18','ON',504,535,'mt sterling','IL','Pre-trip inspection',{
        loadNo:'391912', shippingDocs:'391912', bol:'07/19/2026', po:'21725', destination:'Rice, MN', destinationState:'MN',
        pickedUpLoadNo:'391912', transitionLoadNos:['391912'], transitionSummary:'Picked up 391912',
        documentIds:['bad1','bad2'], shippingDocumentId:'bad2', shippingDocumentType:'bol', shippingDocumentDate:'2020-07-19',
        consignee:'except as nated.',
      }),
      event('pickup178','ON',635,705,'Sherman','IL','Pickup / Loading',{
        loadNo:'178564', shippingDocs:'178564', bol:'178564',
      }),
      event('finalOff18','OFF',1235,1440,'Chicago','IL','Off Duty'),
    ],
    '2026-07-19':[
      event('rollover19','OFF',0,108,'Chicago','','Off Duty',{
        source:'manual_drive_midnight_continuation', loadLinkId:'old_drive',
        crossMidnightFromDay:'2026-07-18', crossMidnightFromEventId:'old_drive', crossMidnightContinuation:true,
      }),
    ],
  },
  certifyStatus:{
    '2026-07-05':'Certified', '2026-07-13':'Certified', '2026-07-14':'Certified',
    '2026-07-15':'Certified', '2026-07-17':'Certified',
  },
  signatureByDay:{
    '2026-07-05':{ signed:true }, '2026-07-13':{ signed:true }, '2026-07-14':{ signed:true },
    '2026-07-15':{ signed:true }, '2026-07-17':{ signed:true },
  },
};

const before = structuredClone(state);
const repaired = repairLogIntegrityV1051(state, { source:'regression' });
const byId = (day, id) => repaired.eventsByDay[day].find(row => row.id === id);

for (const [day, rows] of Object.entries(before.eventsByDay)) {
  for (const row of rows) {
    const next = byId(day, row.id);
    assert.equal(next.startMin, row.startMin, `${day} ${row.id} start time`);
    assert.equal(next.endMin, row.endMin, `${day} ${row.id} end time`);
    assert.equal(next.status, row.status, `${day} ${row.id} duty status`);
  }
}

assert.equal(byId('2026-07-05','pickup111').deliveredLoadNo, '');
assert.equal(byId('2026-07-05','pickup111').pickedUpLoadNo, '111Y7Z983');
assert.equal(byId('2026-07-05','transfer111').deliveredLoadNo, '111Y7Z983');
assert.equal(byId('2026-07-05','transfer111').pickedUpLoadNo, '111J98KGR');
assert.equal(byId('2026-07-13','delivery6273').pickedUpLoadNo, '');
assert.equal(byId('2026-07-13','delivery6273').deliveredLoadNo, '6273');

const pickup391 = byId('2026-07-14','pickup391');
assert.equal(pickup391.bol, '');
assert.equal(pickup391.po, '');
assert.equal(pickup391.destination, 'Mounds View, MN');
assert.equal(pickup391.shippingDocumentId, '');
assert.deepEqual(pickup391.documentIds, ['rate391']);

const stop1 = byId('2026-07-15','stop1');
assert.equal(stop1.pickedUpLoadNo, '');
assert.equal(stop1.deliveredLoadNo, '');
assert.equal(stop1.displayShippingDocs, 'Load 391912');

const stop3 = byId('2026-07-16','stop3');
assert.equal(stop3.pickedUpLoadNo, '');
assert.equal(stop3.deliveredLoadNo, '');

const stop4 = byId('2026-07-17','stop4');
assert.equal(stop4.bol, '');
assert.equal(stop4.pickedUpLoadNo, '');
assert.equal(stop4.deliveredLoadNo, '');
assert.equal(stop4.loadRate, 4800);
assert.equal(stop4.broker, 'H & N Logistics, LLC');
assert.deepEqual(stop4.documentIds, []);

const finalStop = byId('2026-07-17','stop5');
assert.equal(finalStop.pickedUpLoadNo, '');
assert.equal(finalStop.deliveredLoadNo, '391912');
assert.equal(finalStop.transitionSummary, 'Delivered 391912');

const pickup98306 = byId('2026-07-17','pickup98306');
assert.equal(pickup98306.destination, '');
assert.equal(pickup98306.bol, '');
assert.equal(pickup98306.loadReviewStatus, 'needs_review');

const pretrip = byId('2026-07-18','pretrip18');
assert.equal(pretrip.loadNo, '');
assert.equal(pretrip.shippingDocs, '');
assert.equal(pretrip.bol, '');
assert.deepEqual(pretrip.documentIds, []);
assert.equal(pretrip.city, 'Mount Sterling');

const pickup178 = byId('2026-07-18','pickup178');
assert.equal(pickup178.bol, '');
assert.equal(pickup178.pickedUpLoadNo, '178564');

const rollover = byId('2026-07-19','rollover19');
assert.equal(rollover.status, 'OFF');
assert.equal(rollover.state, 'IL');
assert.equal(rollover.source, 'off_duty_midnight_continuation');
assert.equal(rollover.crossMidnightFromEventId, 'finalOff18');

assert.equal(repaired.loadInfo.bol, '');
assert.equal(repaired.loadInfo.po, '');
assert.equal(repaired.loadInfo.stopCount, 0);
assert.equal(repaired.loadInfo.deliveryCount, 0);
assert.equal(repaired.currentLocation.state, 'IL');
assert.equal(repaired.routeLegsByDay['2026-07-17'][0].excludedFromActiveLoad, true);
assert.equal(repaired.loadGuidesById.load_guide_98306.excludedFromActiveLoad, true);

for (const day of ['2026-07-05','2026-07-13','2026-07-14','2026-07-15','2026-07-17']) {
  assert.equal(repaired.certifyStatus[day], 'Needs Recertification', `${day} must be recertified`);
}

assert.deepEqual(repairLogIntegrityV1051(repaired, { source:'idempotence' }), repaired);
assert.ok(read('source/src/app/App.jsx').includes('repairLogIntegrityV1051'), 'App runs log integrity repair');
assert.ok(read('source/src/modules/documents/documentFoundationV105.js').includes('safeSecondaryReferenceV1051'), 'canonical load no longer becomes BOL/PO');
assert.equal(JSON.parse(read('public/app-version.json')).version, '105.1.0');

console.log('PASS — v105.1 Log Integrity First regression suite');
