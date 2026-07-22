import assert from 'node:assert/strict';
import fs from 'node:fs';

import { repairKnownRateConMissionV10965, load97155FieldsV10965 } from '../source/src/modules/loads/livePickupMissionV10965.js';
import { resolveDriverGuideV103 } from '../source/src/modules/loads/loadGuideV103.js';

const fields = load97155FieldsV10965();
assert.equal(fields.loadNo, '97155');
assert.equal(fields.stops.length, 5);
assert.equal(fields.stops.filter(stop => stop.type === 'delivery').length, 4);
assert.equal(fields.stops[0].address, '2451 Bath Rd, Elgin, IL 60124');
assert.equal(fields.stops[1].address, '22160 Allen Rd, Woodhaven, MI 48183');
assert.equal(fields.stops[2].address, '25125 Ford Rd, Dearborn, MI 48128');
assert.equal(fields.stops[3].address, '41550 Ford Rd, Canton, MI 48187');
assert.equal(fields.stops[4].address, '2451 Bath Rd, Elgin, IL 60124');

const hookEvent = {
  id:'event_hook_97155',
  status:'ON',
  startMin:900,
  endMin:930,
  city:'Elgin',
  state:'IL',
  reasons:['Hook / Pickup Trailer'],
  note:'On Duty',
  description:'Trailer 7005',
  loadNo:'97155',
  trailerNo:'7005',
};

const state = {
  activeDay:'2026-07-22',
  currentStatus:'ON',
  currentLocation:{ city:'Elgin', state:'IL' },
  currentTrailer:'7005',
  eventsByDay:{ '2026-07-22':[hookEvent] },
  routeLegsByDay:{},
  documentsByDay:{},
  activeLoadGuideId:'load_guide_97155',
  loadInfo:{
    guideId:'load_guide_97155',
    loadNo:'97155',
    shippingDocs:'97155',
    pickupCity:'DHL YARD',
    deliveryCity:'location after pickup unless otherwise instructed',
    rateConfirmationDocumentId:'document_ratecon_97155',
  },
  loadGuidesById:{
    load_guide_97155:{
      id:'load_guide_97155',
      loadNo:'97155',
      orderNo:'97155',
      origin:'(DHL YARD)',
      destination:'location after pickup unless otherwise instructed',
      deliveryCount:1,
      stops:[
        { id:'pickup_1', type:'pickup', city:'DHL YARD', state:'', cityState:'DHL YARD' },
        { id:'delivery_1', type:'delivery', city:'location after pickup unless otherwise instructed', state:'', cityState:'location after pickup unless otherwise instructed' },
      ],
      steps:[{ id:'review_load', kind:'manual', title:'Review load', checklist:'Broker' }],
      manualDone:{ review_load:Date.now(), accept_tracking:Date.now(), pretrip:Date.now() },
      completedStopIds:[],
      documents:{ rateConfirmationDocumentId:'document_ratecon_97155' },
      status:'active',
      sourceDocumentId:'document_ratecon_97155',
      createdAt:1,
      updatedAt:1,
    },
  },
};

const eventsBefore = JSON.stringify(state.eventsByDay);
const repaired = repairKnownRateConMissionV10965(state);
assert.equal(JSON.stringify(repaired.eventsByDay), eventsBefore, 'mission repair must not change duty events');
assert.equal(repaired.livePickupMissionRepairV10965.loadNo, '97155');
const guide = repaired.loadGuidesById[repaired.activeLoadGuideId];
assert.equal(guide.deliveryCount, 4, 'Load 97155 must have three Michigan deliveries plus the Elgin empty return');
assert.equal(guide.stops.length, 5);
assert.equal(guide.origin, 'Elgin, IL');
assert.equal(guide.destination, 'Elgin, IL');
assert.equal(guide.documents.rateConfirmationDocumentId, 'document_ratecon_97155');

const progressAtPickup = resolveDriverGuideV103(repaired, guide);
const routePickup = progressAtPickup.steps.find(step => step.id === 'route_pickup');
const arrivalPickup = progressAtPickup.steps.find(step => step.id === 'arrive_pickup');
assert.equal(routePickup?.complete, true, 'ON DUTY Hook / Pickup Trailer at Elgin must complete Navigate to pickup');
assert.equal(arrivalPickup?.complete, true, 'ON DUTY Hook / Pickup Trailer at Elgin must complete Log arrival at pickup');
assert.ok(progressAtPickup.currentStep, 'mission must continue to the next pickup task');
assert.notEqual(progressAtPickup.currentStep.id, 'route_pickup');
assert.notEqual(progressAtPickup.currentStep.id, 'arrive_pickup');

const withBol = {
  ...repaired,
  lastDocumentLink:{ type:'bol', loadNo:'97155', documentId:'document_bol_97155', at:Date.now() },
  documentsByDay:{
    ...repaired.documentsByDay,
    '2026-07-22':[
      { id:'document_bol_97155', type:'bol', canonicalLoadNo:'97155', loadNo:'97155', reviewStatus:'verified' },
    ],
  },
};
const progressWithBol = resolveDriverGuideV103(withBol, guide);
assert.equal(progressWithBol.steps.find(step => step.id === 'pickup_bol')?.complete, true, 'verified BOL for Load 97155 must clear Pickup BOL missing');

const guideSource = fs.readFileSync('source/src/modules/loads/loadGuideV103.js', 'utf8');
const guideUiSource = fs.readFileSync('source/src/modules/loads/DriverLoadGuideV103.jsx', 'utf8');
const scanSource = fs.readFileSync('source/src/modules/scan/SmartScanSheetV105.jsx', 'utf8');
const appSource = fs.readFileSync('source/src/app/App.jsx', 'utf8');
const version = JSON.parse(fs.readFileSync('public/app-version.json', 'utf8'));

assert.ok(guideSource.includes('Hook / Pickup Trailer mission recognition') || guideSource.includes('pickupActivityV10965'));
assert.ok(guideSource.includes("step.kind === 'route' ? routeStepCompleteV10965"));
assert.ok(guideSource.includes("new Set(['bol','bill_of_lading'])"));
assert.ok(guideUiSource.includes('normalizeGuideForRenderV10965'));
assert.ok(scanSource.includes('activeGuideDocFieldsV10965'));
assert.ok(scanSource.includes("typeId:meta.id"));
assert.ok(appSource.includes('repairKnownRateConMissionV10965'));
assert.equal(version.version, '109.6.5');
assert.equal(version.build, 'v10965-live-pickup-mission');

console.log('PASS — v109.6.5 advances live pickup from Hook / Pickup Trailer, links BOL, restores Load 97155 route and keeps Full mission safe');
