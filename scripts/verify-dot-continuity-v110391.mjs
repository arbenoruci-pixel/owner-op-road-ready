import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { durLabel, nowMin, timeLabel } from '../source/src/shared/utils/time.js';
import { addDays, localDayKey } from '../source/src/shared/utils/date.js';
import { label } from '../source/src/shared/utils/status.js';
import { readLogbookDayState, applyDayFormEdit } from '../source/src/modules/logbook/dayFormV110.js';
import { certificationStatusV1032, createCertificationRecord } from '../source/src/modules/logbook/certificationV110.js';
import { applyLogbookEditorEdit, projectLogbookEvents } from '../source/src/modules/logbook/eventEditingV110.js';
import { validateLogForSigning } from '../source/src/modules/logbook/signing.js';
import { getHomeTerminalTimeZone, timeZoneShortLabel } from '../source/src/core/time/homeTerminalTime.js';
import { sanitizeLogText } from '../source/src/shared/utils/logText.js';
import { routeLegsForDayCanonical } from '../source/src/core/routes/routeNormalization.js';
import { eventHasNoLoadDeclaration } from '../source/src/core/routes/shippingDocsRepair.js';
import { DOC_SECTIONS, evaluateDotWallet, normalizeWallet } from '../source/src/core/wallet/dotWallet.js';
import { readLogbookReportDay, logbookReportGaps } from '../source/src/modules/logbook/reportDayV110391.js';
import { patchDotContinuity } from './finalize-dot-continuity-v110391.mjs';

const source = fs.readFileSync('source/src/modules/dot/DotMode.jsx', 'utf8');
assert.equal(patchDotContinuity(source), source, 'production installs the report continuity finalizer idempotently');

function block(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'report helper block: ' + start);
  return source.slice(from, to);
}
const at = new Date('2026-09-20T16:00:00Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [at.getTime()])); }
  static now() { return at.getTime(); }
}
const report = vm.runInNewContext([
  block('const DEFAULT_DRIVER_NAME', 'function DotDocumentViewer('),
  block('function roadsideDocumentId(', 'function pdfAscii('),
  '({ reportEventsForDay, dayReportHtml, reportHtml, logPackageStats })',
].join('\n'), {
  Date:FixedDate, durLabel, nowMin:() => 720, timeLabel, addDays, localDayKey, label,
  readLogbookDayState, certificationStatusV1032, validateLogForSigning, readLogbookReportDay, logbookReportGaps,
  getHomeTerminalTimeZone, timeZoneShortLabel, sanitizeLogText,
  routeLegsForDayCanonical, eventHasNoLoadDeclaration, DOC_SECTIONS, evaluateDotWallet, normalizeWallet,
});
const today = '2026-09-20', day = '2026-09-19';
const base = {
  activeDay:today, homeTerminalTimeZone:'America/New_York',
  driverProfile:{ name:'Example Driver' }, driver:{ truck:'228', trailer:'529' },
  carrierName:'Example Carrier', dotNumber:'1234567', mainOfficeAddress:'1 Main Street, Darien, IL',
  currentTrailer:'529', eventsByDay:{}, signatureByDay:{}, formByDay:{}, routeLegsByDay:{},
  inspectionByDay:{}, dotWallet:{ documents:{} },
};
for (const status of ['OFF', 'SB', 'ON', 'D']) {
  const event = { id:'live', status, source:'live_status', startMin:60, endMin:61, city:'Darien', state:'IL' };
  const state = { ...base, currentStatus:status, eventsByDay:{ [today]:[event] },
    ...(status === 'D' ? { manualDrivingSession:{ active:true, eventId:'live', startDay:today } } : {}) };
  assert.equal(report.reportEventsForDay(state, today)[0].endMin, 720, 'a genuinely live event still reaches Now');
  const ended = applyLogbookEditorEdit(state, { day:today, id:'live', patch:{ endMin:120 },
    expected:structuredClone(event), expectedRows:structuredClone([event]) }, at);
  assert.equal(ended.ok, true, ended.error);
  assert.equal(ended.events[0].paperLogEndV110315, true, 'real editor records the explicit End');
  const reopened = JSON.parse(JSON.stringify(ended.state));
  const before = JSON.stringify(reopened);
  const logbookRows = projectLogbookEvents(reopened, today, at);
  const reportRows = report.reportEventsForDay(reopened, today);
  assert.equal(logbookRows[0].endMin, 120);
  assert.equal(reportRows[0].endMin, logbookRows[0].endMin, status + ' DOT report honors the same manual End as Logbook');
  assert.equal(JSON.stringify(reopened), before, 'report preserves stored events and attestation');
}

const state = { ...base, currentStatus:'OFF', eventsByDay:{ [day]:[
  { id:'off', status:'OFF', startMin:0, endMin:1440, city:'Darien', state:'IL', note:'Off duty' },
] } };
const certified = { ...state, signatureByDay:{ [day]:createCertificationRecord(state, day, {
  signatureDataUrl:'data:image/png;base64,AAAA', now:at.getTime(),
}) } };
const edited = applyDayFormEdit(certified, certified, { truck:'229' }, day);
const eventEdited = { ...certified, eventsByDay:{ [day]:state.eventsByDay[day].map(event => ({ ...event, note:'Corrected remark' })) } };
for (const [value, count, signed] of [[certified, 1, true], [edited, 0, false], [eventEdited, 0, false]]) {
  const before = JSON.stringify(value);
  const html = report.reportHtml(value, [day]);
  const stats = report.logPackageStats(value, [day]);
  assert.ok(html.includes(`<span>Certified</span><b>${count} / 1</b>`), 'export summary uses authoritative certification');
  assert.equal(stats.rows[0].signed, signed, 'in-app package agrees with the exported summary');
  assert.equal(stats.unsigned, signed ? 0 : 1, 'edited signed days return to the signing count');
  assert.equal(html.includes('<small>Signed</small>'), signed, 'daily sheet agrees with both summaries');
  assert.equal(html.includes('alt="Driver signature"'), signed, 'changed facts hide the stale signature');
  assert.equal(JSON.stringify(value), before, 'all report surfaces remain read-only');
}
const historical = report.reportHtml({ ...certified, homeTerminalTimeZone:'America/Los_Angeles' }, [day]);
assert.ok(historical.includes('America/New_York') && historical.includes('Start (EDT)'));
assert.ok(historical.includes('<span>Certified</span><b>1 / 1</b>'));

// Reproduce the reported start times with their preceding recorded status.
// These fixtures use example identity/location values, not production records.
const row = (id, status, startMin, endMin, extra = {}) => ({ id, status, startMin, endMin,
  city:'Example City', state:'IL', ...extra });
const fixture = { ...base, eventsByDay:{
  '2026-09-13':[row('prior-off', 'OFF', 98, 1440)],
  '2026-09-14':[
    row('start-drive','D',1122,1123), row('pretrip','ON',1123,1150),
    row('drive-2','D',1150,1236), row('hook','ON',1236,1247),
    row('drive-3','D',1247,1380), row('break','OFF',1380,1421), row('drive-4','D',1421,1440),
  ],
  '2026-09-15':[row('prior-sleeper','SB',1438,1440)],
  '2026-09-16':[
    row('stale-off','OFF',0,617,{syntheticCoverage:true,source:'timeline_continuity'}),
    row('pretrip-16','ON',617,632), row('drive-16-1','D',632,725),
    row('rest-16-1','OFF',725,851), row('drive-16-2','D',851,962),
    row('rest-16-2','OFF',962,998), row('hook-16','ON',998,1019), row('drive-16-3','D',1019,1440),
  ],
} };
const view = (value, date) => report.reportEventsForDay(value, date);
const minutes = events => events.reduce((sum, event) => sum + event.endMin - event.startMin, 0);
const untouched = JSON.stringify(fixture);
for (const [date, status, start] of [['2026-09-14','OFF',1122], ['2026-09-16','SB',617]]) {
  const events = view(fixture, date);
  assert.equal(events[0].startMin, 0, date + ' must start at midnight');
  assert.equal(events[0].endMin, start);
  assert.equal(events[0].status, status, 'use the preceding recorded duty status');
  assert.equal(minutes(events), 1440, 'reported day has 24 hours without duplicate coverage');
  assert.equal(logbookReportGaps(events).length, 0);
  assert.deepEqual(events.slice(1).map(event => [event.id,event.startMin,event.endMin]),
    fixture.eventsByDay[date].filter(event => !event.syntheticCoverage).map(event => [event.id,event.startMin,event.endMin]),
    'all actual change times remain exact');
  const html = report.dayReportHtml(fixture, date);
  assert.ok(html.includes('12:00:00 AM') && html.includes('24.00</text>'));
  assert.ok(!html.includes('Incomplete log:'));
}
assert.equal(JSON.stringify(fixture), untouched, 'rendering must never materialize carry rows in storage');
const sleeperHtml = report.dayReportHtml(fixture, '2026-09-16');
assert.ok(sleeperHtml.includes('data-status="SB">10.28</text>'), 'Sleeper carry has the correct duty total');
assert.ok(sleeperHtml.includes('data-status="OFF">2.70</text>'), 'stale synthetic OFF is not counted');
const packageHtml = report.reportHtml(fixture, ['2026-09-14','2026-09-16']);
assert.equal((packageHtml.match(/24\.00<\/text>/g) || []).length, 2, 'shared package uses the same complete day projection');

// A status continues on an otherwise empty day only when its source is known.
for (const status of ['OFF','SB','ON']) {
  const value = { ...base, eventsByDay:{ [day]:[row('prior',status,1300,1301,{source:'live_status'})] } };
  assert.equal(view(value, day).at(-1).endMin, 1440, 'historical live snapshot continues to midnight');
  assert.equal(view(value, today)[0].status, status);
  assert.equal(view(value, today)[0].endMin, 720, 'empty current day stops at terminal Now');
  assert.equal(readLogbookReportDay(value,today,at,'America/Los_Angeles')[0].endMin, 540,
    'frozen report zone controls the clock, independent of the device');
  assert.equal(view(value, '2026-09-21').length, 0, 'future reports remain empty');
}

const partial = { ...base, eventsByDay:{ [day]:[row('only','D',60,120)] } };
assert.equal(view(partial,day).length,1, 'no unknown midnight or tail status is invented');
const missingHtml = report.dayReportHtml(partial,day);
assert.ok(missingHtml.includes('Incomplete log:') && missingHtml.includes('Review these times in Logbook.'));
assert.deepEqual(logbookReportGaps(view(partial,day)),[{startMin:0,endMin:60},{startMin:120,endMin:1440}]);
assert.equal(view(base,today).length,0, 'an entirely unknown day stays unknown');
for (const status of ['OFF','SB','ON','D']) {
  const event = row('ended',status,300,420,{source:'live_status',paperLogEndV110315:true});
  const value = {...base,eventsByDay:{[day]:[event]}};
  assert.equal(view(value,day)[0].endMin,420,'historical explicit End remains authoritative');
  assert.equal(view(value,today).length,0,'a closed prior day cannot supply a prefix');
}
const priorDriving = {...base,eventsByDay:{[day]:[row('driving','D',300,1440)]}};
assert.equal(view(priorDriving,today).length,0,'Driving cannot be inferred across midnight');
const internalGap = {...base,eventsByDay:{[day]:[
  row('a','OFF',0,100),row('b','ON',130,1440),
]}};
assert.deepEqual(logbookReportGaps(view(internalGap,day)),[{startMin:100,endMin:130}], 'interior gaps remain visible');
const legacyEnd = row('old-end','SB',100,200,{source:'live_status'});
const oldEndState = {...base,eventsByDay:{[day]:[legacyEnd]}, logbookEditHistoryByDay:{[day]:[{
  kind:'edit',targetId:legacyEnd.id,beforeEvents:[{...legacyEnd,endMin:1440}],afterEvents:[legacyEnd],
}]}};
assert.equal(view(oldEndState,day)[0].endMin,200,'older explicit End audit remains authoritative');
assert.equal(view(oldEndState,today).length,0);

// Only a recorded, exact midnight link completes a historical Driving origin.
const driving = {...base,eventsByDay:{[day]:[row('origin','D',1300,1301)], [today]:[
  row('continuation','D',0,60,{source:'manual_drive_midnight_continuation',crossMidnightContinuation:true,
    crossMidnightFromDay:day,crossMidnightFromEventId:'origin'}),
]}};
assert.equal(view(driving,day)[0].endMin,1440);
const unrelated = structuredClone(driving);
unrelated.eventsByDay[today][0].crossMidnightFromEventId='other';
assert.equal(view(unrelated,day)[0].endMin,1301,'unrelated next-day Driving cannot complete the origin');
const deletedLink = structuredClone(driving);
deletedLink.eventsByDay[today][0].deleted=true;
assert.equal(view(deletedLink,day)[0].endMin,1301,'a deleted next-day link cannot complete Driving');
driving.eventsByDay[day][0].paperLogEndV110315=true;
assert.equal(view(driving,day)[0].endMin,1301,'linked Driving still honors manual End');

for (const flag of ['voided','deleted','deletedAt','syntheticCoverage','displayOnly','carriedFromPreviousDay','synthetic','continuityGenerated']) {
  const value={...base,eventsByDay:{[day]:[row('fake','OFF',0,1440,{[flag]:true})]}};
  assert.equal(view(value,day).length,0,flag+' row is never exported');
  assert.equal(view(value,today).length,0,flag+' row is never evidence for continuity');
}
const corrupt = {...base,eventsByDay:{'2026-09-18':[row('older','OFF',0,1440)], [day]:[row('bad','SB',1300,1200)]}};
assert.equal(view(corrupt,today).length,0,'malformed intervening records block carry from older days');
const carryAfterEdit = structuredClone(fixture);
carryAfterEdit.eventsByDay['2026-09-16'][1].paperLogEndV110315=true;
assert.equal(view(carryAfterEdit,'2026-09-16')[0].status,'SB','a manually ended first change retains independently known midnight status');
assert.equal(view(carryAfterEdit,'2026-09-16')[1].endMin,632);
console.log('PASS — screenshot day prefixes, OFF/SB/ON carry, full-day/current-day continuity, exact boundaries, explicit Ends, proven Driving links, real-gap notices, exports, certification, frozen zones and no state writes');
