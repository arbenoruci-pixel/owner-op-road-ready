import assert from 'node:assert/strict';

const { resolveDriverGuideV103 } = await import(`../source/src/modules/loads/loadGuideV103.js?v108=${Date.now()}`);

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

const state = {
  currentLocation:{ city:'Rochelle', state:'IL' },
  eventsByDay:{ '2026-07-15':[{ id:'off_1', status:'OFF', startMin:0, endMin:600, city:'Rochelle', state:'IL', note:'Off Duty' }] },
  routeLegsByDay:{},
  documentsByDay:{},
  loadGuidesById:{ [guide.id]:guide },
  activeLoadGuideId:guide.id,
};

const progress = resolveDriverGuideV103(state, guide);
assert.equal(progress.steps.find(step => step.id === 'route_pickup')?.complete, true);
assert.equal(progress.currentStep?.id, 'arrive_delivery_3');
console.log('verify-driver-guide-progress-v108 passed');
