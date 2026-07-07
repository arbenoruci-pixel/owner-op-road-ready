import assert from 'node:assert/strict';
import { normalizeRoadReadyState } from '../source/src/core/routes/routeNormalization.js';
import { signBlockMessage, validateLogForSigning } from '../source/src/modules/logbook/signing.js';
import { buildDotOfficerCheck } from '../source/src/core/dot/dotOfficerCheckEngine.js';

const day = '2026-07-06';
const state = normalizeRoadReadyState({
  activeDay: day,
  eventsByDay:{
    '2026-07-05': [
      { id:'prev_off', status:'OFF', startMin:1300, endMin:1440, city:'North Baltimore', state:'OH' },
    ],
    [day]: [
      { id:'off', status:'OFF', startMin:38, endMin:40, city:'Maumee', state:'OH', lat:41.1866, lng:-83.7481, note:'Off Duty' },
      { id:'on', status:'ON', startMin:40, endMin:48, city:'North Baltimore', state:'OH', lat:41.1866, lng:-83.7481, note:'Drop & Hook · Pre-trip inspection', shippingDocs:'114RMB689 / 113NRH53Z', loadNo:'114RMB689 / 113NRH53Z' },
      { id:'d', status:'D', startMin:48, endMin:252, city:'North Baltimore', state:'OH', note:'Driving started', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z' },
      { id:'on2', status:'ON', startMin:252, endMin:260, city:'Indianapolis', state:'IN' },
      { id:'sb', status:'SB', startMin:260, endMin:1440, city:'Indianapolis', state:'IN' },
    ],
  },
  routeLegsByDay:{ [day]:[{ id:'leg113', day, pickupDay:day, pickupEventId:'on', deliveryEventId:'on2', fromCity:'North Baltimore', fromState:'OH', toCity:'Greenfield', toState:'IN', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', miles:206, status:'delivered' }] },
  manualMilesByDay:{ [day]:206 },
  driver:{ truck:'228', trailer:'Trailer 53' },
  driverProfile:{ name:'Arben Oruci' },
  carrierName:'Narta Express LLC',
  mainOfficeAddress:'92 201 Lake Drive, Willowbrook, IL 60527',
  inspectionByDay:{ [day]:{ complete:true, sourceEventId:'on', sourceStartMin:40 } },
  loadInfo:{ loadNo:'113NRH53Z', shippingDocs:'113NRH53Z' },
});

const block = signBlockMessage(state, day);
assert.equal(block, '', `false stale-location metadata must not block signing: ${block}`);
const signIssues = validateLogForSigning(state, day).map(issue => `${issue.code || ''} ${issue.title || ''} ${issue.detail || ''}`).join('\n');
assert.ok(!/38m|coverage_group|day_start_gap/i.test(signIssues), 'carryover gap should not appear in sign issues');
const check = buildDotOfficerCheck(state, day);
const fatalLocation = check.issues.filter(issue => issue.severity === 'fix' && /location/i.test(`${issue.id || ''} ${issue.title || ''}`));
assert.equal(fatalLocation.length, 0, 'DOT check has no fatal location blocker for same-coordinate stale labels');

console.log('verify-sign-does-not-block-on-false-location-v9574 passed');
