import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  guideClosedOrMalformedV10958,
  repairCompletedLoadCommandV10958,
  shouldSuppressActiveLoadCommandV10958,
} from '../source/src/modules/loads/completedLoadCloseoutV10958.js';
import {
  applyLoadGuideActionV103,
  getActiveLoadGuideV103,
  resolveDriverGuideV103,
} from '../source/src/modules/loads/loadGuideV103.js';
import { activeGuideLoadSummaryV105 } from '../source/src/modules/loads/activeLoadSummaryV105.js';

const malformedGuideId = 'load_guide_4245901';
const malformedState = {
  view:'home',
  sheet:null,
  activeLoadGuideId:malformedGuideId,
  loadInfo:{
    guideId:malformedGuideId,
    loadNo:'424590-1',
    shippingDocs:'424590-1',
    pickupCity:'Chicago',
    pickupState:'IL',
    deliveryCity:'Final delivery',
    deliveryState:'',
    stopCount:0,
    deliveryCount:0,
    source:'rate_confirmation_guide_v103',
  },
  loadGuidesById:{
    [malformedGuideId]:{
      id:malformedGuideId,
      loadNo:'424590-1',
      orderNo:'424590-1',
      origin:'Chicago, IL',
      destination:'Final delivery',
      status:'active',
      steps:[],
      stops:[],
      deliveryCount:0,
      stopCount:0,
      source:'rate_confirmation_import_v103',
      updatedAt:Date.now(),
    },
  },
  routeLegsByDay:{
    '2026-07-21':[
      {
        id:'424590-1-final',
        loadGroupId:malformedGuideId,
        loadNo:'424590-1',
        shippingDocs:'424590-1',
        status:'delivered',
        stopStatus:'done',
        guideCompleted:true,
      },
    ],
  },
  activeLoadSummary:{
    guideId:malformedGuideId,
    loadNo:'424590-1',
    stopCount:0,
    completedStops:0,
    percent:0,
  },
};

assert.equal(guideClosedOrMalformedV10958(malformedState.loadGuidesById[malformedGuideId]), true, 'zero-step guide must be closed/malformed');
assert.equal(getActiveLoadGuideV103(malformedState), null, 'zero-step completed mission must never be selected as active');
assert.equal(resolveDriverGuideV103(malformedState).guide, null, 'zero-step mission must resolve to no guide');
assert.equal(activeGuideLoadSummaryV105(malformedState, { loads:[] }), null, 'malformed mission must not create Active Load summary');
assert.equal(shouldSuppressActiveLoadCommandV10958(malformedState, { loads:[] }, malformedState.activeLoadSummary), true, 'stale 0/0 command must be suppressed');

const repaired = repairCompletedLoadCommandV10958(malformedState);
assert.equal(repaired.activeLoadGuideId, '', 'stale active guide pointer must clear');
assert.deepEqual(repaired.loadInfo, {}, 'stale loadInfo must clear');
assert.equal(repaired.activeLoadSummary, null, 'stale active load summary must clear');
assert.equal(repaired.loadGuidesById[malformedGuideId].status, 'completed', 'malformed persisted guide must be closed');
assert.equal(repaired.loadGuidesById[malformedGuideId].excludedFromActiveLoad, true, 'closed guide must stay excluded from Active Load');

const validGuideId = 'load_guide_TEST100';
const validState = {
  view:'loadGuide',
  sheet:{ type:'driver_load_mission' },
  activeLoadGuideId:validGuideId,
  loadInfo:{ guideId:validGuideId, loadNo:'TEST-100', shippingDocs:'TEST-100', source:'rate_confirmation_guide_v103' },
  loadGuidesById:{
    [validGuideId]:{
      id:validGuideId,
      loadNo:'TEST-100',
      orderNo:'TEST-100',
      status:'active',
      steps:[{ id:'final_pod', kind:'manual', title:'Finish load' }],
      stops:[{ id:'delivery_1', type:'delivery', city:'Chicago', state:'IL' }],
      manualDone:{},
      completedStopIds:[],
      updatedAt:Date.now(),
    },
  },
  routeLegsByDay:{
    '2026-07-22':[{ id:'leg_1', loadGroupId:validGuideId, loadNo:'TEST-100', status:'planned', stopSequence:1 }],
  },
};

const completed = applyLoadGuideActionV103(validState, { action:'complete_guide', guideId:validGuideId, stepId:'final_pod' });
assert.equal(completed.activeLoadGuideId, '', 'Load complete action must clear active guide pointer');
assert.deepEqual(completed.loadInfo, {}, 'Load complete action must clear current loadInfo alias');
assert.equal(completed.loadGuidesById[validGuideId].status, 'completed', 'Load complete action must close guide');
assert.equal(completed.routeLegsByDay['2026-07-22'][0].status, 'delivered', 'Load complete action must close route legs');
assert.equal(completed.view, 'home', 'completed Full mission view must return Home');
assert.equal(completed.sheet, null, 'completed mission sheet must close');

const homeSource = fs.readFileSync('source/src/modules/home/HomeScreen.jsx', 'utf8');
const guideUiSource = fs.readFileSync('source/src/modules/loads/DriverLoadGuideV103.jsx', 'utf8');
const helperSource = fs.readFileSync('source/src/modules/loads/completedLoadCloseoutV10958.js', 'utf8');
const appSource = fs.readFileSync('source/src/app/App.jsx', 'utf8');
const version = JSON.parse(fs.readFileSync('public/app-version.json', 'utf8'));

assert.ok(homeSource.includes('guideOpen && getActiveLoadGuideV103(state)'), 'Full mission must open only with a usable guide');
assert.ok(homeSource.includes('shouldSuppressActiveLoadCommandV10958'), 'Home must suppress completed load command');
assert.ok(guideUiSource.includes('guide.steps.length === 0'), 'mission UI must reject zero-step guide');
assert.ok(guideUiSource.includes('const stops = Array.isArray(g?.stops)'), 'mission UI must tolerate missing stops');
assert.ok(helperSource.includes('relatedLegs.length > 0 && relatedLegs.every'), 'empty route arrays must not close an unrelated guide');
assert.ok(appSource.includes('repairCompletedLoadCommandV10958(integrityRepaired)'), 'startup must repair persisted completed load aliases');
assert.equal(version.version, '109.5.8');
assert.equal(version.build, 'v10958-completed-load-command-closeout');

console.log('PASS — v109.5.8 completed load 424590-1 no longer shows 0/0 mission or freezes Full mission');
