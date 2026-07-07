import assert from 'node:assert/strict';
import { normalizeRoadReadyState } from '../source/src/core/routes/routeNormalization.js';
import { buildDotOfficerCheck } from '../source/src/core/dot/dotOfficerCheckEngine.js';
import { validateLogForSigning } from '../source/src/modules/logbook/signing.js';

const day = '2026-07-05';
const state = normalizeRoadReadyState({
  activeDay: day,
  eventsByDay: {
    [day]: [
      { id:'off', status:'OFF', startMin:0, endMin:862, city:'Chicago', state:'IL' },
      { id:'transition', status:'ON', startMin:862, endMin:885, city:'North Baltimore', state:'OH', note:'Drop & Hook 114RMB689 / 113NRH53Z', shippingDocs:'114RMB689 / 113NRH53Z', loadNo:'114RMB689 / 113NRH53Z' },
      { id:'d', status:'D', startMin:885, endMin:1100, city:'North Baltimore', state:'OH', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z' },
      { id:'sb', status:'SB', startMin:1100, endMin:1440, city:'Greenfield', state:'IN' },
    ],
  },
  driver:{ truck:'228', trailer:'Trailer 53' },
  driverProfile:{ name:'Arben Oruci' },
  carrierName:'Narta Express LLC',
  mainOfficeAddress:'92 201 Lake Drive, Willowbrook, IL 60527',
  manualMilesByDay:{ [day]:206 },
  inspectionByDay:{ [day]:{ complete:true, sourceEventId:'transition', sourceStartMin:862 } },
  routeLegsByDay:{
    [day]: [
      { id:'old', day, deliveryEventId:'transition', shippingDocs:'114RMB689', loadNo:'114RMB689', fromCity:'Perrysburg', fromState:'OH', toCity:'North Baltimore', toState:'OH', status:'delivered' },
      { id:'new', day, pickupEventId:'transition', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', fromCity:'North Baltimore', fromState:'OH', toCity:'Greenfield', toState:'IN', status:'open' },
    ],
  },
  loadInfo:{ loadNo:'113NRH53Z', shippingDocs:'113NRH53Z' },
});

const event = state.eventsByDay[day].find(row => row.id === 'transition');
assert.equal(event.deliveredLoadNo, '114RMB689', 'transition event records delivered load number');
assert.equal(event.pickedUpLoadNo, '113NRH53Z', 'transition event records picked-up load number');
assert.ok(/Delivered 114RMB689 · Picked up 113NRH53Z/.test(event.transitionSummary || ''), 'transition display summary is clean');

const check = buildDotOfficerCheck(state, day);
const dotText = check.issues.map(issue => `${issue.id || ''} ${issue.title || ''} ${issue.detail || ''}`).join('\n');
assert.ok(!/Shipping docs duplicated/i.test(dotText), 'DOT check should not flag transition old/new docs as duplicates');
const signText = validateLogForSigning(state, day).map(issue => `${issue.code || ''} ${issue.title || ''} ${issue.detail || ''}`).join('\n');
assert.ok(!/duplicate/i.test(signText), 'Sign check should not flag transition docs as duplicates');

console.log('verify-transition-shipping-docs-not-duplicate-v9574 passed');
