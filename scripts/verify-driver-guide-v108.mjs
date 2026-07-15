import assert from 'node:assert/strict';
import { applyLoadGuideActionV108 } from '../source/src/modules/loads/loadGuideActionV108.js';
import { resolveDriverGuideV103 } from '../source/src/modules/loads/loadGuideV103.js';

const guide = {
  id:'load_guide_391912',
  loadNo:'391912',
  orderNo:'391912',
  status:'active',
  manualDone:{},
  completedStopIds:[],
  documents:{},
  steps:[
    { id:'route_pickup', kind:'route', title:'Navigate to pickup', day:'2000-01-01', city:'Rochelle', state:'IL', location:'Rochelle, IL', loadNo:'391912' },
    { id:'arrive_delivery_3', kind:'status', title:'Log arrival at stop 3', day:'2099-01-01', city:'Rogers', state:'MN', status:'ON', reason:'Delivery / Unloading', loadNo:'391912' },
  ],
};

const base = {
  view:'logs',
  activeDay:'2026-07-15',
  sheet:null,
  currentStatus:'OFF',
  currentReason:'Off Duty',
  currentLocation:{ city:'Rogers', state:'MN' },
  eventsByDay:{ '2026-07-15':[{ id:'off_1', status:'OFF', startMin:0, endMin:600, city:'Rogers', state:'MN', note:'Off Duty' }] },
  certifyStatus:{ '2026-07-15':'Active day / Not certified yet' },
  signatureByDay:{},
  inspectionByDay:{},
  routeLegsByDay:{ '2026-07-14':[{ id:'leg_1', loadGroupId:guide.id, stopSequence:1, status:'planned' }] },
  loadInfo:{ loadNo:'391912' },
  loadGuidesById:{ [guide.id]:guide },
  activeLoadGuideId:guide.id,
};

{
  const next = applyLoadGuideActionV108(base, { action:'toggle_done', guideId:guide.id, stepId:'route_pickup', step:guide.steps[0] });
  assert.equal(next.view, base.view);
  assert.equal(next.activeDay, base.activeDay);
  assert.equal(next.sheet, base.sheet);
  assert.strictEqual(next.eventsByDay, base.eventsByDay);
  assert.strictEqual(next.routeLegsByDay, base.routeLegsByDay);
  assert.equal(next.loadGuidesById[guide.id].manualDone.route_pickup > 0, true);
}

{
  const progress = resolveDriverGuideV103(base, guide);
  assert.equal(progress.steps.find(step => step.id === 'route_pickup').complete, true);
  assert.equal(progress.currentStep?.id, 'arrive_delivery_3');
}

console.log('verify-driver-guide-v108 passed');
