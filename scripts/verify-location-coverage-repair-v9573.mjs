import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rawCoverageIssues, buildCoverageFixGroup } from '../source/src/core/compliance/rawRodsChecks.js';
import { buildDotOfficerCheck } from '../source/src/core/dot/dotOfficerCheckEngine.js';
import { validateLogForSigning } from '../source/src/modules/logbook/signing.js';

const day = '2026-07-06';
const prevDay = '2026-07-05';
const eventsByDay = {
  [prevDay]: [
    { id:'prev_off', status:'OFF', startMin:1383, endMin:1440, city:'North Baltimore', state:'OH', note:'Off Duty', source:'manual' },
  ],
  [day]: [
    { id:'off_start', status:'OFF', startMin:38, endMin:40, city:'Maumee', state:'OH', lat:41.18663, lng:-83.74815, note:'Off Duty', locationSource:'gps' },
    { id:'pickup_pretrip', status:'ON', startMin:40, endMin:48, city:'North Baltimore', state:'OH', lat:41.18664, lng:-83.74816, note:'Drop & Hook · delivered 114RMB689 · picked up 113NRH53Z · Pre-trip inspection', locationSource:'manual' },
    { id:'drive', status:'D', startMin:48, endMin:252, city:'Maumee', state:'OH', note:'Driving started', locationSource:'manual' },
    { id:'pretrip2', status:'ON', startMin:252, endMin:260, city:'Indianapolis', state:'IN', note:'Pre-trip inspection', locationSource:'manual' },
    { id:'sb', status:'SB', startMin:260, endMin:1440, city:'Indianapolis', state:'IN', note:'Sleeper Berth', locationSource:'manual' },
  ],
};
const state = {
  activeDay: day,
  eventsByDay,
  manualMilesByDay: { [day]:206 },
  driver:{ truck:'228', trailer:'Trailer 53' },
  currentTrailer:'Trailer 53',
  driverProfile:{ name:'Arben Oruci' },
  carrierName:'Narta Express LLC',
  mainOfficeAddress:'92 201 Lake Drive, Willowbrook, IL 60527',
  inspectionByDay:{ [day]:{ complete:true, sourceEventId:'pickup_pretrip', sourceStartMin:40 } },
  routeLegsByDay:{ [day]:[{ id:'leg113', day, pickupDay:day, pickupMin:40, fromCity:'North Baltimore', fromState:'OH', toCity:'Greenfield', toState:'IN', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', status:'open' }] },
  loadInfo:{ shippingDocs:'113NRH53Z', loadNo:'113NRH53Z' },
  equipment:{ type:'intermodal', container:'AZNU203742', chassis:'NSPZ135827' },
  certifyStatus:{},
  signatureByDay:{},
};

const coverage = rawCoverageIssues(eventsByDay, day, { currentLocation:{ city:'Indianapolis', state:'IN' } });
assert.equal(coverage.issues.some(issue => issue.code === 'day_start_gap'), false, 'previous OFF carryover should prevent false 38m start gap');
assert.equal(buildCoverageFixGroup(coverage, day), null, 'coverage group should not exist when carryover makes the day complete');

const check = buildDotOfficerCheck(state, day);
const dotIssueText = check.issues.map(issue => `${issue.id || issue.code || ''} ${issue.title || ''} ${issue.detail || ''}`).join('\n');
assert.ok(!/Pre-trip \/ driving location mismatch/i.test(dotIssueText), 'DOT check should not flag contiguous generic driving location after pickup/pretrip');
assert.ok(!/Location jump with no driving/i.test(dotIssueText), 'DOT check should not flag effectively same GPS place with different city label');

const signIssues = validateLogForSigning(state, day);
const signIssueText = signIssues.map(issue => `${issue.code || ''} ${issue.title || ''} ${issue.detail || ''}`).join('\n');
assert.ok(!/coverage_group|day_start_gap|38m/i.test(signIssueText), 'signing should not block on false start coverage');
assert.ok(!/location_jump/i.test(signIssueText), 'signing should not block on false location jump/mismatch');

const appSrc = fs.readFileSync('source/src/app/App.jsx', 'utf8');
assert.ok(appSrc.includes('repairContiguousDrivingStartLocations'), 'app should repair stale generic driving start locations');
assert.ok(appSrc.includes('shouldInheritPreviousOnDutyLocation'), 'new driving starts should inherit connected ON DUTY location when no GPS coordinate is provided');

console.log('verify-location-coverage-repair-v9573 passed');
