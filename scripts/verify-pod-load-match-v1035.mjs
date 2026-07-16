import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySmartPodMatchV1035, applySmartPodSuggestionV1035, matchSmartPodToLoadV1035, podBillingPatchV1035 } from '../source/src/modules/scan/smartPodMatchV1035.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const guide = {
  id:'load_guide_391912',
  loadNo:'391912',
  orderNo:'391912',
  legNo:'395851',
  status:'active',
  stops:[
    { type:'pickup', id:'pickup_1', city:'Rochelle', state:'IL', date:'2026-07-14', poNumber:'26242159510' },
    { type:'delivery', id:'delivery_2', company:'SYSCO ST PAUL', city:'Mounds View', state:'MN', date:'2026-07-15', poNumber:'26144210', address:'Mounds View, MN 55112' },
    { type:'delivery', id:'delivery_3', company:'HOLIDAY PANTRY BROOKLYN CENTER', city:'Brooklyn Center', state:'MN', date:'2026-07-15', poNumber:'2792' },
    { type:'delivery', id:'delivery_4', company:'REINHART FOODSERVICE', city:'Rogers', state:'MN', date:'2026-07-16', poNumber:'26150893478' },
    { type:'delivery', id:'delivery_5', company:'SYSCO SAINT CLOUD', city:'SAINT CLOUD', state:'MN', date:'2026-07-17', poNumber:'4929910' },
    { type:'delivery', id:'delivery_6', company:'ROMA', city:'Rice', state:'MN', date:'2026-07-17', poNumber:'26242159510' },
  ],
};
const state = {
  activeLoadGuideId:guide.id,
  loadGuidesById:{ [guide.id]:guide },
  loadInfo:{ guideId:guide.id, loadNo:'391912', orderNo:'391912', legNo:'395851' },
  currentLocation:{ city:'Rogers', state:'MN' },
  eventsByDay:{
    '2026-07-15':[
      { id:'mounds', status:'ON', startMin:573, endMin:591, city:'Mounds View', state:'MN', note:'Pre-trip inspection · Delivery / Unloading', shippingDocs:'391912', orderNo:'391912', legNo:'395851', po:'26144210' },
      { id:'brooklyn', status:'ON', startMin:632, endMin:647, city:'Brooklyn Center', state:'MN', note:'Delivery / Unloading', shippingDocs:'391912', po:'2792' },
    ],
    '2026-07-16':[{ id:'rogers', status:'ON', startMin:654, endMin:700, city:'Rogers', state:'MN', note:'Delivery / Unloading', shippingDocs:'391912', po:'26150893478' }],
  },
};

const fields = {
  date:'2026-07-14',
  loadNo:'',
  poNumber:'26144210',
  destination:'Mounds View, MN 55112',
  title:'Proof of Delivery',
  podSigned:true,
};
const analysis = { text:'RECEIVED SYSCO MINNESOTA MOUNDS VIEW MN PO 26144210 CONSIGNEE SIGNATURE', confidence:.39 };
const match = matchSmartPodToLoadV1035(state, 'pod', fields, analysis);
assert.equal(match.loadNo, '391912');
assert.equal(match.legNo, '395851');
assert.equal(match.stopSequence, 1);
assert.equal(match.stopPo, '26144210');
assert.equal(match.linkDay, '2026-07-15', 'POD must link to delivery event day, not issue date');
assert.equal(match.eventId, 'mounds');
assert.equal(match.finalStop, false);
const applied = applySmartPodMatchV1035(fields, match);
assert.equal(applied.loadNo, '391912');
assert.equal(applied.linkDay, '2026-07-15');
assert.equal(applied.linkEventId, 'mounds');
assert.equal(applied.matchedStopSequence, 1);
assert.equal(applied.podFinalStop, false);
const suggestion = applySmartPodSuggestionV1035({ day:'2026-07-14', reason:'Document date matches this log day', confidence:.64 }, match);
assert.equal(suggestion.day, '2026-07-15');
assert.equal(suggestion.eventId, 'mounds');
assert.match(suggestion.reason, /POD matched load 391912/);

const store = {
  loads:[{ id:'load1', loadNo:'391912', status:'in_progress' }],
  documents:[
    { type:'rate_confirmation', loadNo:'391912' },
    { type:'bol', loadNo:'391912' },
    { type:'pod', loadNo:'391912', extracted:{ type:'pod', loadNo:'391912', podSigned:true, podFinalStop:false } },
  ],
};
const partial = podBillingPatchV1035({ store, loadNo:'391912', date:'2026-07-15', podDocumentId:'pod1', fields:applied });
assert.equal(partial.ready, false);
assert.equal(partial.intermediatePod, true);
assert.equal(partial.patch.status, 'in_progress');
assert.equal(partial.patch.billingStage, 'partial_pod_received');
assert.equal(partial.patch.factoringStatus, 'final_stop_pod_pending');
const finalFields = { ...applied, matchedStopId:'delivery_6', matchedStopSequence:5, matchedStopCount:5, matchedStopPo:'26242159510', podFinalStop:true, linkDay:'2026-07-17' };
const finalStore = { ...store, documents:[...store.documents, { type:'pod', loadNo:'391912', extracted:{ type:'pod', loadNo:'391912', podSigned:true, podFinalStop:true } }] };
const final = podBillingPatchV1035({ store:finalStore, loadNo:'391912', date:'2026-07-17', podDocumentId:'pod-final', fields:finalFields });
assert.equal(final.ready, true);
assert.equal(final.patch.status, 'invoice_ready');
assert.equal(final.patch.billingStage, 'ready_for_factoring');

const sheet = read('source/src/modules/scan/SmartScanSheetV100.jsx');
const link = read('source/src/modules/scan/smartDocumentLinkV100.js');
assert.match(sheet,/matchSmartPodToLoadV1035/);
assert.match(sheet,/Load matched automatically/);
assert.match(sheet,/podBillingPatchV1035/);
assert.match(link,/const exactRef = !eventId/);
console.log('verify-pod-load-match-v1035 passed');
