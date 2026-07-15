import assert from 'node:assert/strict';
import {
  applyLoadGuideActionV103,
  applySmartDocumentLinkV103,
  getActiveLoadGuideV103,
  resolveDriverGuideV103,
} from '../source/src/modules/loads/loadGuideV103.js';

const stops = [
  { type:'pickup', company:'ROCHELLE MIXING CENTER', street:'600 WISCOLD DR', city:'Rochelle', state:'IL', zip:'61045', cityState:'Rochelle, IL', date:'07/14/2026', time:'00:00', appointment:'07/14/2026 00:00', pieces:4366, weight:41482, pickupNumber:'5010037538', poNumber:'26242159510', commodity:'FROZEN MEAT' },
  { type:'delivery', company:'SYSCO ST PAUL', street:'2400 COUNTY ROAD J', city:'Mounds View', state:'MN', zip:'55112', cityState:'Mounds View, MN', date:'07/15/2026', time:'06:00', appointment:'07/15/2026 06:00', poNumber:'26144210' },
  { type:'delivery', company:'HOLIDAY PANTRY BROOKLYN CENTER', street:'6890 SHINGLE CREEK PKWY', city:'Brooklyn Center', state:'MN', zip:'55430', cityState:'Brooklyn Center, MN', date:'07/15/2026', time:'12:00', appointment:'07/15/2026 12:00', poNumber:'2792' },
  { type:'delivery', company:'REINHART FOODSERVICE', street:'13400 COMMERCE BLVD', city:'Rogers', state:'MN', zip:'55374', cityState:'Rogers, MN', date:'07/16/2026', time:'07:00', appointment:'07/16/2026 07:00', poNumber:'26150893478' },
  { type:'delivery', company:'SYSCO SAINT CLOUD', street:'900 HIGHWAY 10 S', city:'Saint Cloud', state:'MN', zip:'56304', cityState:'Saint Cloud, MN', date:'07/17/2026', time:'06:00', appointment:'07/17/2026 06:00', poNumber:'4929910' },
  { type:'delivery', company:'ROMA', street:'625 Division St N', city:'Rice', state:'MN', zip:'56367', cityState:'Rice, MN', date:'07/17/2026', time:'09:00', appointment:'07/17/2026 09:00', poNumber:'26242159510' },
];

const sourceText = `
H & N Logistics, LLC
Order #: 391912
Leg #: 395851
LOAD TRACKING VIA FOURKITES APP IS MANDATORY FOR ALL LOADS
DRIVERS MUST SHOW A VALID DRIVERS LICENSE WHEN LOADING OR UNLOADING.
THEY MUST ALSO WEAR CLASS 2 HI-VISIBILITY VEST/SHIRT WHILE ON SITE.
TRAILER MUST BE CLEAN INSIDE, SANITARY, DAMAGE FREE,AND PRECOOLED TO 40F.
A CONTINUOUS SEAL RECORD MUST BE MAINTAINED ON ALL STOPS.
In and out times for detentions must be noted and signed on the BOL.
DO NOT LEAVE THE RECEIVERS before reporting OS&D.
ALL PAPERWORK MUST BE RETURNED WITHIN 24 HOURS OF DELIVERY.
`;

const originalEvents = {
  '2026-07-14':[
    { id:'off_1', status:'OFF', startMin:0, endMin:600, city:'Rochelle', state:'IL', note:'Off Duty' },
  ],
};

const state = {
  activeDay:'2026-07-14',
  currentStatus:'OFF',
  currentLocation:{ city:'Rochelle', state:'IL' },
  eventsByDay:originalEvents,
  routeLegsByDay:{},
  loadInfo:{},
  documentsByDay:{},
  certifyStatus:{ '2026-07-14':'Active day / Not certified yet' },
};

const payload = {
  type:{ id:'rate_confirmation', label:'Rate Confirmation' },
  fields:{
    type:'rate_confirmation',
    linkToLogbook:true,
    linkDay:'2026-07-14',
    date:'07/14/2026',
    pickupDate:'07/14/2026',
    deliveryDate:'07/17/2026',
    loadNo:'391912',
    orderNo:'391912',
    legNo:'395851',
    broker:'H & N Logistics, LLC',
    carrierName:'Narta Express LLC',
    mcNumber:'MC871792',
    equipment:'Reefer',
    trackingProvider:'FourKites',
    pickupNumber:'5010037538',
    total:4800,
    linehaul:4800,
    totalPieces:4366,
    weight:41482,
    commodity:'FROZEN MEAT',
    origin:'Rochelle, IL',
    destination:'Rice, MN',
    stops,
    stopCount:6,
    deliveryCount:5,
    routeSummary:'PU Rochelle, IL\nD1 Mounds View, MN\nD5 Rice, MN',
  },
  localDocument:{ local_id:'doc_rate_391912', original_file_name:'LoadConfirmation395851.pdf' },
  analysis:{ confidence:.98, text:sourceText },
};

const linked = applySmartDocumentLinkV103(state, payload);
assert.deepEqual(linked.eventsByDay, originalEvents, 'Rate Con import must not create or change duty-status events');
assert.equal(linked.loadInfo.loadNo, '391912');
assert.equal(linked.loadInfo.stopCount, 6);
assert.equal(linked.loadInfo.deliveryCount, 5);
assert.equal(linked.loadInfo.pickupCity, 'Rochelle');
assert.equal(linked.loadInfo.deliveryCity, 'Rice');
assert.equal(linked.loadInfo.trackingProvider, 'FourKites');

const guide = getActiveLoadGuideV103(linked);
assert.ok(guide, 'Active driver guide was not created');
assert.equal(guide.loadNo, '391912');
assert.equal(guide.deliveryCount, 5);
assert.equal(guide.requirements.preCoolTemperature, 40);
assert.equal(guide.requirements.driverLicenseRequired, true);
assert.equal(guide.requirements.hiVisRequired, true);
assert.equal(guide.requirements.sealRecordRequired, true);
assert.ok(guide.steps.some(step => step.id === 'accept_tracking'));
assert.ok(guide.steps.some(step => step.id === 'pickup_bol'));
assert.equal(guide.steps.filter(step => /^arrive_delivery_/.test(step.id)).length, 5);
assert.ok(guide.steps.some(step => step.id === 'final_pod'));

const plannedLegs = Object.values(linked.routeLegsByDay).flat();
assert.equal(plannedLegs.length, 5);
assert.equal(plannedLegs[0].fromCity, 'Rochelle');
assert.equal(plannedLegs[0].toCity, 'Mounds View');
assert.equal(plannedLegs.at(-1).toCity, 'Rice');
assert.ok(plannedLegs.every(leg => leg.status === 'planned'));

const marked = applyLoadGuideActionV103(linked, { action:'toggle_done', guideId:guide.id, stepId:'review_load', step:{ id:'review_load' } });
assert.ok(marked.loadGuidesById[guide.id].manualDone.review_load);

const stopped = applyLoadGuideActionV103(marked, { action:'complete_stop', guideId:guide.id, stepId:'complete_stop_1', step:{ id:'complete_stop_1', stopSequence:1 } });
assert.equal(Object.values(stopped.routeLegsByDay).flat().find(leg => leg.stopSequence === 1)?.status, 'delivered');

const progress = resolveDriverGuideV103(stopped, stopped.loadGuidesById[guide.id]);
assert.ok(progress.total > 20);
assert.ok(progress.completed >= 2);
assert.ok(progress.currentStep);

console.log('verify-driver-load-guide-v103 passed');
await import('./materialize-v104.mjs');
