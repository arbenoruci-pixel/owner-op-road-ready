import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  findBolEvidenceV10966,
  pickupPresenceV10966,
  safeMissionProgressV10966,
} from '../source/src/modules/loads/safeMissionModelV10966.js';

const guide = {
  id:'load_guide_97155',
  loadNo:'97155',
  orderNo:'97155',
  origin:'Elgin, IL',
  destination:'Elgin, IL',
  pickupNumber:'7HR',
  poNumbers:['57918682ORS'],
  stops:[
    { id:'pickup_1', type:'pickup', city:'Elgin', state:'IL', cityState:'Elgin, IL', address:'2451 Bath Rd, Elgin, IL 60124' },
    { id:'delivery_1', type:'delivery', city:'Woodhaven', state:'MI', cityState:'Woodhaven, MI' },
  ],
  steps:[
    { id:'review_load', kind:'manual', title:'Review load and route' },
    { id:'accept_tracking', kind:'manual', title:'Accept FourKites tracking' },
    { id:'pretrip', kind:'status', title:'Complete pre-trip inspection' },
    { id:'route_pickup', kind:'route', title:'Navigate to pickup', city:'Elgin', state:'IL', location:'Elgin, IL' },
    { id:'arrive_pickup', kind:'status', title:'Log arrival at pickup', status:'ON', reason:'Pickup / Loading', city:'Elgin', state:'IL' },
    { id:'pickup_ready', kind:'manual', title:'Pickup ready checklist', checklist:'Pickup # 7HR' },
    { id:'pickup_bol', kind:'document', title:'Capture BOL and seal', documentType:'bol' },
    { id:'depart_pickup', kind:'status', title:'Depart pickup loaded', status:'D', reason:'Driving' },
  ],
  manualDone:{ review_load:1, accept_tracking:2, pretrip:3 },
  documents:{},
};

const state = {
  currentStatus:'ON',
  currentLocation:{ city:'Elgin', state:'IL' },
  currentTrailer:'7005',
  eventsByDay:{
    '2026-07-22':[
      {
        id:'hook_97155',
        status:'ON',
        city:'Elgin',
        state:'IL',
        reasons:['Hook / Pickup Trailer'],
        note:'On Duty',
        description:'Trailer 7005',
        loadNo:'97155',
      },
    ],
  },
  documentsByDay:{},
};

const businessStore = {
  documents:[
    {
      id:'bol_97155',
      type:'bol',
      canonicalLoadNo:'97155',
      loadNo:'97155',
      reviewStatus:'verified',
    },
  ],
};

assert.equal(pickupPresenceV10966(state, guide), true, 'Hook / Pickup Trailer at Elgin must prove pickup presence');
assert.equal(findBolEvidenceV10966(state, guide, businessStore)?.id, 'bol_97155', 'verified Load 97155 BOL must be found from the Vault');

const progress = safeMissionProgressV10966(state, guide, businessStore);
assert.equal(progress.steps.find(step => step.id === 'route_pickup')?.complete, true, 'Navigate to pickup must complete automatically');
assert.equal(progress.steps.find(step => step.id === 'arrive_pickup')?.complete, true, 'Log arrival at pickup must complete automatically');
assert.equal(progress.steps.find(step => step.id === 'pickup_bol')?.complete, true, 'Pickup BOL must clear when the verified BOL is in Load 97155');
assert.equal(progress.currentStep?.id, 'pickup_ready', 'the next real driver task must be Pickup ready checklist');

const home = fs.readFileSync('source/src/modules/home/HomeScreen.jsx', 'utf8');
const safeScreen = fs.readFileSync('source/src/modules/loads/SafeDriverMissionV10966.jsx', 'utf8');
const sw = fs.readFileSync('public/sw.js', 'utf8');
const forcePage = fs.readFileSync('public/force-update-10966.html', 'utf8');
const version = JSON.parse(fs.readFileSync('public/app-version.json', 'utf8'));

assert.ok(home.includes("import SafeDriverMissionV10966 from '../loads/SafeDriverMissionV10966.jsx';"), 'Home must import the safe mission screen');
assert.ok(home.includes('<SafeDriverMissionV10966 state={state}'), 'Full mission must use the safe mission screen');
assert.equal(safeScreen.includes('window.location.reload'), false, 'mission screen must never reload the app');
assert.equal(safeScreen.includes('window.location.replace'), false, 'mission screen must never replace the page');
assert.equal(safeScreen.includes('Retry'), false, 'mission screen must not show the old Retry trap');
assert.ok(safeScreen.includes('No reload is required.'), 'mission boundary must stay inside the app');
assert.ok(sw.includes("cache:'no-store'"), 'service worker must use network-authoritative app chunks');
assert.equal(sw.includes('caches.match'), false, 'service worker must not serve stale cached chunks');
assert.ok(forcePage.includes('force-update-10966') === false || forcePage.includes('Installing 109.6.6'));
assert.equal(version.version, '109.6.6');
assert.equal(version.build, 'v10966-no-reload-mission-shell');

console.log('PASS — v109.6.6 opens Full Mission without reload, advances pickup evidence and clears the matching BOL warning');
