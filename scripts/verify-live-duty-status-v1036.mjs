import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDayKey } from '../source/src/shared/utils/date.js';
import { rawCoverageIssues } from '../source/src/core/compliance/rawRodsChecks.js';
import { extendCurrentStatusTailV1036 } from '../source/src/core/timeline/liveStatusTailV1036.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const today = localDayKey();
const events = [
  { id:'off_start', status:'OFF', startMin:0, endMin:654, city:'Rogers', state:'MN', note:'Off Duty' },
  { id:'on_work', status:'ON', startMin:654, endMin:700, city:'Rogers', state:'MN', note:'Pre-trip inspection · Delivery / Unloading' },
  { id:'off_break', status:'OFF', startMin:700, endMin:829, city:'Rogers', state:'MN', note:'Off Duty · Break' },
  { id:'drive', status:'D', startMin:829, endMin:907, city:'Rogers', state:'MN', note:'Driving started' },
  { id:'off_live', status:'OFF', startMin:907, endMin:908, city:'St. Cloud', state:'MN', note:'Off Duty' },
];

const derived = extendCurrentStatusTailV1036(events, {
  isCurrentDay:true,
  targetEnd:913,
  currentStatus:'OFF',
});
console.log('v103.6 direct tail diagnostic', JSON.stringify({ extended:derived.extended, last:derived.events.at(-1), inputLast:events.at(-1) }));
assert.equal(derived.extended, true, 'direct helper must mark the active OFF tail extended');
assert.equal(derived.events.at(-1).startMin, 907, 'direct helper must preserve OFF start');
assert.equal(derived.events.at(-1).endMin, 913, 'direct helper must extend OFF through target now');
assert.equal(events.at(-1).endMin, 908, 'stored input must not be mutated');

const liveCoverage = rawCoverageIssues({ [today]:events }, today, {
  nowMinute:913,
  currentStatus:'OFF',
  currentLocation:{ city:'St. Cloud', state:'MN' },
});
console.log('v103.6 coverage diagnostic', JSON.stringify({ today, total:liveCoverage.total, targetEnd:liveCoverage.targetEnd, issues:(liveCoverage.issues || []).map(issue => ({ code:issue.code || issue.id, startMin:issue.startMin, endMin:issue.endMin })), liveTailDerivedV1036:liveCoverage.liveTailDerivedV1036, events:(liveCoverage.events || []).map(event => ({ id:event.id, status:event.status, startMin:event.startMin, endMin:event.endMin })) }));
assert.equal(liveCoverage.total, 913, 'raw coverage total must include the active OFF tail through now');
assert.equal(liveCoverage.issues.some(issue => String(issue.code || issue.id) === 'day_end_gap'), false, 'active OFF must cover through now');

const mismatched = rawCoverageIssues({ [today]:events }, today, {
  nowMinute:913,
  currentStatus:'ON',
  currentLocation:{ city:'St. Cloud', state:'MN' },
});
assert.equal(mismatched.issues.some(issue => String(issue.code || issue.id) === 'day_end_gap'), true, 'tail must not extend when active status does not match');

const dayScreen = read('source/src/modules/logbook/DayLogScreen.jsx');
const rawChecks = read('source/src/core/compliance/rawRodsChecks.js');
const dotCheck = read('source/src/core/dot/dotOfficerCheckEngine.js');
const signing = read('source/src/modules/logbook/signing.js');
assert.match(dayScreen,/liveMinuteV1036/);
assert.match(dayScreen,/window\.setInterval\(tickV1036, 10000\)/);
assert.match(dayScreen,/nowMinute:liveMinuteV1036/);
assert.match(rawChecks,/extendCurrentStatusTailV1036/);
assert.match(rawChecks,/coverageBaseV1036/);
assert.match(dotCheck,/currentStatus:safeText\(state\.currentStatus\)/);
assert.match(signing,/currentStatus:String\(state\.currentStatus/);
console.log('verify-live-duty-status-v1036 passed');
