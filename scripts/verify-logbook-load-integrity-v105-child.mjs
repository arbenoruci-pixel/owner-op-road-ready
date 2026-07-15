import assert from 'node:assert/strict';
import { activeGuideLoadSummaryV105 } from '../source/src/modules/loads/activeLoadSummaryV105.js';
import { normalizeCompletedDayCertificationV105 } from '../source/src/modules/logbook/certificationIntegrityV105.js';
import { buildDriverLoadGuideV103, resolveDriverGuideV103 } from '../source/src/modules/loads/loadGuideV103.js';
import { routeLegsForDayCanonical } from '../source/src/core/routes/routeNormalization.js';
import { buildDotOfficerCheck } from '../source/src/core/dot/dotOfficerCheckEngine.js';
import { isFatalSigningIssue } from '../source/src/modules/logbook/signing.js';

const stops = [
  { type:'pickup', company:'ROCHELLE MIXING CENTER', city:'Rochelle', state:'IL', cityState:'Rochelle, IL', date:'2026-07-14', time:'00:00', pickupNumber:'5010037538' },
  { type:'delivery', company:'SYSCO ST PAUL', city:'Mounds View', state:'MN', cityState:'Mounds View, MN', date:'2026-07-15', time:'06:00' },
  { type:'delivery', company:'ROMA', city:'Rice', state:'MN', cityState:'Rice, MN', date:'2026-07-17', time:'09:00' },
];
const guide = buildDriverLoadGuideV103({
  loadNo:'391912', orderNo:'391912', legNo:'395851', broker:'H & N Logistics, LLC',
  total:4800, equipment:'Reefer', pickupNumber:'5010037538', origin:'Rochelle, IL', destination:'Rice, MN',
  pickupDate:'2026-07-14', deliveryDate:'2026-07-17', stops, stopCount:3, deliveryCount:2,
}, { sourceText:'FourKites tracking mandatory. Valid driver license. Hi-vis. Precooled to 40F.' });

const events = [
  { id:'off', status:'OFF', startMin:0, endMin:547, city:'Chicago', state:'IL', note:'Off Duty' },
  { id:'pretrip', status:'ON', startMin:547, endMin:562, city:'Chicago', state:'IL', note:'Pre-trip inspection' },
  { id:'drive_to_pickup', status:'D', startMin:562, endMin:693, city:'Chicago', state:'IL', note:'Driving started' },
  { id:'waiting', status:'ON', startMin:693, endMin:774, city:'Rochelle', state:'IL', note:'Waiting' },
  { id:'depart_loaded', status:'D', startMin:774, endMin:951, city:'Rochelle', state:'IL', note:'Driving started', loadNo:'391912' },
  { id:'sleeper', status:'SB', startMin:1169, endMin:1440, city:'Mounds View', state:'MN', note:'Sleeper Berth' },
];

const activeLeg = {
  id:`${guide.id}_leg_1`, loadGroupId:guide.id, day:'2026-07-14', pickupDay:'2026-07-14', deliveryDay:'2026-07-15',
  fromCity:'Rochelle', fromState:'IL', toCity:'Mounds View', toState:'MN', loadNo:'391912', shippingDocs:'391912', status:'planned', source:'rate_confirmation_guide_v103', stopSequence:1,
};
const staleLegs = [
  { id:'old_607', day:'2026-07-10', pickupDay:'2026-07-10', fromCity:'Wilmington', fromState:'IL', toCity:'Cheshire', toState:'CT', loadNo:'607', shippingDocs:'607', status:'open' },
  { id:'old_batavia', day:'2026-07-11', pickupDay:'2026-07-11', fromCity:'East Hartford', fromState:'CT', toCity:'Batavia', toState:'IL', loadNo:'OLD123', shippingDocs:'OLD123', status:'open' },
];

const state = {
  activeDay:'2026-07-14',
  activeLoadGuideId:guide.id,
  loadGuidesById:{ [guide.id]:guide },
  loadInfo:{ guideId:guide.id, loadNo:'391912', shippingDocs:'391912', gross:4800, pickupCity:'Rochelle', pickupState:'IL', deliveryCity:'Rice', deliveryState:'MN' },
  eventsByDay:{ '2026-07-14':events },
  routeLegsByDay:{ '2026-07-10':[staleLegs[0]], '2026-07-11':[staleLegs[1]], '2026-07-14':[activeLeg] },
  certifyStatus:{ '2026-07-14':'Active day / Not certified yet' },
  signatureByDay:{},
  driverProfile:{ name:'Arben Oruci' }, carrierName:'Narta Express LLC', mainOfficeAddress:'Willowbrook, IL',
  driver:{ truck:'Unit 12', trailer:'Trailer 53' }, currentTrailer:'Trailer 53',
  inspectionByDay:{ '2026-07-14':{ complete:true, sourceEventId:'pretrip', sourceStartMin:547 } },
  manualMilesByDay:{ '2026-07-14':500 },
};

const summary = activeGuideLoadSummaryV105(state, { loads:[{ loadNo:'607', gross:9999 }, { loadNo:'391912', gross:4800 }] });
assert.equal(summary.loadNo, '391912');
assert.equal(summary.origin, 'Rochelle, IL');
assert.equal(summary.destination, 'Rice, MN');
assert.equal(summary.gross, 4800);

const scopedLegs = routeLegsForDayCanonical(state, '2026-07-14');
assert.ok(scopedLegs.some(leg => leg.id === activeLeg.id));
assert.ok(!scopedLegs.some(leg => leg.id === 'old_607'));
assert.ok(!scopedLegs.some(leg => leg.id === 'old_batavia'));

const dot = buildDotOfficerCheck(state, '2026-07-14');
const routeSection = dot.sections.find(section => section.id === 'route');
assert.ok(routeSection);
assert.ok(!routeSection.issues.some(issue => /Open load carried in/i.test(issue.title || '')));

const certification = normalizeCompletedDayCertificationV105(state.certifyStatus, state.signatureByDay, state.eventsByDay, '2026-07-15');
assert.equal(certification['2026-07-14'], 'Needs signature');
assert.equal(isFatalSigningIssue({ code:'hos_split_sleeper', title:'Sleeper under 7h. Need more rest.' }), false);
assert.equal(isFatalSigningIssue({ code:'missing_location_x', title:'Event location is missing' }), true);

const progress = resolveDriverGuideV103(state, guide);
assert.equal(progress.steps.find(step => step.id === 'pretrip')?.complete, true, 'Chicago pre-trip on pickup day should count');
assert.equal(progress.steps.find(step => step.id === 'depart_pickup')?.complete, true, 'Rochelle driving departure should count');
assert.equal(progress.steps.find(step => step.id === 'depart_delivery_1')?.complete, false, 'Rochelle driving must not complete a future Mounds View departure');

console.log('verify-logbook-load-integrity-v105 passed');
