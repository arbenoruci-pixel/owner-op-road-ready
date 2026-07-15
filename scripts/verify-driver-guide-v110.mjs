import assert from 'node:assert/strict';

const safe = await import(`../source/src/modules/loads/loadGuideSafeV110.js?v110=${Date.now()}`);
const guideModule = await import(`../source/src/modules/loads/loadGuideV103.js?v110=${Date.now()}`);

const malformed = {
  id:'load_guide_391912',
  loadNo:391912,
  orderNo:'391912',
  origin:'Rochelle, IL',
  destination:'Rice, MN',
  status:'active',
  steps:{
    first:{ id:'pickup_ready', kind:'manual', title:'Pickup ready checklist', checklist:{ a:'Trailer clean', b:'Verify pickup number' } },
    second:{ id:'route_delivery_1', kind:'route', title:'Route to stop 1', city:'Mounds View', state:'MN', checklist:'Open route' },
  },
  stops:{
    pickup:{ company:'Rochelle Mixing Center', type:'pickup', city:'Rochelle', state:'IL' },
    delivery:{ company:'Sysco St Paul', type:'delivery', city:'Mounds View', state:'MN' },
  },
  manualDone:null,
  completedStopIds:'1',
  documents:null,
};

const normalized = safe.normalizeDriverGuideV110(malformed);
assert.equal(Array.isArray(normalized.steps), true);
assert.equal(Array.isArray(normalized.stops), true);
assert.deepEqual(normalized.steps[0].checklist, ['Trailer clean', 'Verify pickup number']);
assert.deepEqual(normalized.steps[1].checklist, ['Open route']);
assert.deepEqual(normalized.completedStopIds, ['1']);
assert.deepEqual(normalized.manualDone, {});
assert.deepEqual(normalized.documents, {});

const state = {
  currentLocation:{ city:'Rogers', state:'MN' },
  eventsByDay:{},
  routeLegsByDay:{},
  documentsByDay:{},
  loadGuidesById:{ [malformed.id]:malformed },
  activeLoadGuideId:malformed.id,
};
const progress = guideModule.resolveDriverGuideV103(state, malformed);
assert.equal(progress.guide.id, malformed.id);
assert.equal(Array.isArray(progress.steps), true);
assert.equal(progress.steps.length, 2);
assert.equal(progress.currentStep?.id, 'pickup_ready');
console.log('verify-driver-guide-v110 passed');
