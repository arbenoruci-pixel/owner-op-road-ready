import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { repairCrossMidnightFlagsV1037 } from '../source/src/core/hos/crossMidnightFlagV1037.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const hosUrl = pathToFileURL(path.join(ROOT, 'source/src/core/hos/hosEngine.js')).href;
const { analyzeLinkedHos } = await import(`${hosUrl}?v=1037-${Date.now()}`);

const day = '2026-07-14';
const accurateHistoricalEvents = [
  { id:'pretrip', status:'ON', startMin:547, endMin:562, city:'Chicago', state:'IL', note:'Pre-trip inspection' },
  { id:'drive1', status:'D', startMin:562, endMin:693, city:'Chicago', state:'IL', note:'Driving started' },
  { id:'wait', status:'ON', startMin:693, endMin:724, city:'Rochelle', state:'IL', note:'Waiting' },
  { id:'pickup', status:'ON', startMin:724, endMin:774, city:'Rochelle', state:'IL', note:'Pickup / Loading' },
  { id:'drive2', status:'D', startMin:774, endMin:951, city:'Rochelle', state:'IL', note:'Driving started' },
  { id:'fuel', status:'ON', startMin:951, endMin:961, city:'New Lisbon', state:'WI', note:'Fuel' },
  { id:'off', status:'OFF', startMin:961, endMin:995, city:'New Lisbon', state:'WI', note:'Off Duty' },
  { id:'drive3', status:'D', startMin:995, endMin:1169, city:'Clearfield', state:'WI', note:'Driving started', crossMidnightContinues:true },
  { id:'sleep', status:'SB', startMin:1169, endMin:1439, city:'Mounds View', state:'MN', note:'Sleeper Berth' },
];

const clean = analyzeLinkedHos({ [day]:accurateHistoricalEvents }, day, { [day]:'Certified' });
const cleanWindow = clean.cards.find(card => card.label === '14h Window');
assert.ok(cleanWindow, '14h card must exist');
assert.equal(cleanWindow.value, 'Expired');
assert.equal(cleanWindow.sub, 'No driving after limit');
assert.equal(cleanWindow.ok, true);
assert.equal(
  clean.warnings.some(warning => warning.severity === 'high' && /shift clock expired|14h window violation/i.test(String(warning.text || ''))),
  false,
  'OFF/SB after the 14h limit must not create a high violation warning'
);
assert.equal(
  clean.violationRanges.some(range => range.type === 'window14'),
  false,
  'No red window14 range is allowed without Driving after the limit'
);

const actualViolationEvents = [
  ...accurateHistoricalEvents.filter(event => event.id !== 'sleep'),
  { id:'sleep_before', status:'SB', startMin:1169, endMin:1390, city:'Mounds View', state:'MN', note:'Sleeper Berth' },
  { id:'drive_after_limit', status:'D', startMin:1390, endMin:1410, city:'Mounds View', state:'MN', note:'Driving started' },
  { id:'off_after', status:'OFF', startMin:1410, endMin:1439, city:'Mounds View', state:'MN', note:'Off Duty' },
];
const violation = analyzeLinkedHos({ [day]:actualViolationEvents }, day, { [day]:'Certified' });
const violationWindow = violation.cards.find(card => card.label === '14h Window');
assert.equal(violationWindow.value, 'Violation');
assert.equal(violationWindow.ok, false);
assert.equal(
  violation.warnings.some(warning => warning.severity === 'high' && /14h window violation/i.test(String(warning.text || ''))),
  true,
  'Driving after the limit must remain a high review issue'
);
assert.equal(violation.violationRanges.some(range => range.type === 'window14'), true);

const repaired = repairCrossMidnightFlagsV1037({
  [day]:accurateHistoricalEvents,
  '2026-07-15':[{ id:'next_off', status:'OFF', startMin:0, endMin:10, city:'Mounds View', state:'MN', note:'Off Duty' }],
});
assert.equal(repaired[day].find(event => event.id === 'drive3').crossMidnightContinues, undefined);
assert.equal(repaired[day].find(event => event.id === 'drive3').startMin, 995);
assert.equal(repaired[day].find(event => event.id === 'drive3').endMin, 1169);

const validCarry = repairCrossMidnightFlagsV1037({
  '2026-07-20':[{ id:'late_drive', status:'D', startMin:1400, endMin:1439, crossMidnightContinues:true }],
  '2026-07-21':[{ id:'continued_drive', status:'D', startMin:0, endMin:30 }],
});
assert.equal(validCarry['2026-07-20'][0].crossMidnightContinues, true);

const hosSource = read('source/src/core/hos/hosEngine.js');
const appSource = read('source/src/app/App.jsx');
assert.match(hosSource,/drivingAfter14V1037/);
assert.match(hosSource,/No driving after limit/);
assert.match(appSource,/repairCrossMidnightFlagsV1037/);
console.log('verify-driving-only-window-v1037 passed');
