import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { durLabel, nowMin, timeLabel } from '../source/src/shared/utils/time.js';
import { addDays, localDayKey } from '../source/src/shared/utils/date.js';
import { label } from '../source/src/shared/utils/status.js';
import { readLogbookDayState, applyDayFormEdit } from '../source/src/modules/logbook/dayFormV110.js';
import { certificationStatusV1032, createCertificationRecord } from '../source/src/modules/logbook/certificationV110.js';
import { getHomeTerminalTimeZone, timeZoneShortLabel } from '../source/src/core/time/homeTerminalTime.js';
import { sanitizeLogText } from '../source/src/shared/utils/logText.js';
import { routeLegsForDayCanonical } from '../source/src/core/routes/routeNormalization.js';
import { eventHasNoLoadDeclaration } from '../source/src/core/routes/shippingDocsRepair.js';
import { patchManualRodsReport } from './finalize-dot-manual-report-v110389.mjs';

const original = fs.readFileSync('source/src/modules/dot/DotMode.jsx', 'utf8');
const source = patchManualRodsReport(original);
assert.equal(patchManualRodsReport(source), source, 'report finalizer is idempotent');
function block(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `source block ${start} exists`);
  return source.slice(from, to);
}
const report = vm.runInNewContext([
  block('const DEFAULT_DRIVER_NAME', 'function documentStatusLabel'),
  block('function officerSignatureLabel', 'function driverInspectionReadiness'),
  block('function svgGraphMarkup', 'function reportHtml'),
  '({ dayRange, reportEventsForDay, drivingMilesForDay, dutyTotals, dayReportHtml, dailyLogStyleText })',
].join('\n'), {
  durLabel, nowMin, timeLabel, addDays, localDayKey, label, readLogbookDayState, certificationStatusV1032,
  getHomeTerminalTimeZone, timeZoneShortLabel, sanitizeLogText,
  routeLegsForDayCanonical, eventHasNoLoadDeclaration,
});
const today = localDayKey(new Date(), 'America/New_York');
const day = addDays(today, -1);
const events = [
  { id:'off', status:'OFF', startMin:0, endMin:420, city:'Darien', state:'IL' },
  { id:'on', status:'ON', startMin:420, endMin:450, city:'Darien', state:'IL', note:'Pre-trip' },
  { id:'drive', status:'D', startMin:450, endMin:720, city:'Darien', state:'IL', manualMiles:180.5, shippingDocs:'BOL-123' },
  { id:'unload', status:'ON', startMin:720, endMin:750, city:'Madison', state:'WI', note:'Unload' },
  { id:'return', status:'D', startMin:750, endMin:900, city:'Madison', state:'WI', manualMiles:125.25 },
  { id:'rest', status:'OFF', startMin:900, endMin:1440, city:'Darien', state:'IL' },
];
const state = {
  homeTerminalTimeZone:'America/New_York',
  driverProfile:{ name:'Example Driver', email:'private@example.test' },
  driver:{ truck:'NEXT-UNIT', trailer:'NEXT-TRAILER' },
  carrierName:'Example Carrier', dotNumber:'1234567', mainOfficeAddress:'1 Main Street, Darien, IL',
  equipment:{ trailer:'NEXT-TRAILER' },
  formByDay:{ [day]:{ truck:'228', trailer:'529', carrierName:'Recorded Carrier', coDrivers:'Second Driver' } },
  eventsByDay:{ [day]:events },
  manualMilesByDay:{},
  signatureByDay:{},
  loadInfo:{ sourceEventDay:today, shippingDocs:'UNRELATED-LOAD' },
};
const before = JSON.stringify(state);
const html = report.dayReportHtml(state, day);
assert.equal(JSON.stringify(state), before, 'rendering must not change any saved log data');
assert.equal(report.dayRange(today).length, 8, 'current day plus seven previous days');
assert.equal(report.dayRange(today).at(-1), addDays(today, -7));
for (const required of [day, 'Example Driver', 'Second Driver', 'Recorded Carrier', '1234567',
  '1 Main Street, Darien, IL', '228', '529', '305.75', 'BOL-123', 'Midnight', 'Noon',
  'Home-terminal time', 'America/New_York', 'Location', 'Remarks', 'Driver Signature']) {
  assert.ok(html.includes(required), `manual RODS field ${required} is rendered`);
}
assert.doesNotMatch(html, /ELD|Engine Hours|Unidentified Events|Recap|Inspection|private@example|NEXT-UNIT|NEXT-TRAILER|UNRELATED-LOAD/,
  'daily log contains no telemetry, optional recap, private email, or unrelated current data');
for (const [status, hours] of [['OFF','16.00'],['SB','0.00'],['D','7.00'],['ON','1.00']]) {
  assert.ok(html.includes(`data-status="${status}">${hours}</text>`), `right-side ${status} total`);
}
assert.ok(html.includes('24.00</text>'), 'completed recorded day totals 24 hours');
const trailerChanges = report.dayReportHtml({ ...state, eventsByDay:{ [day]:events.map(event =>
  event.id === 'unload' ? { ...event, droppedTrailer:'529', hookedTrailer:'612' } : event
) } }, day);
assert.ok(trailerChanges.includes('529 · 612'), 'all trailers recorded as used during the day are listed');
assert.equal(report.drivingMilesForDay(state, day, events), 305.75, 'sum recorded driving event miles');
assert.equal(report.drivingMilesForDay({ ...state, manualMilesByDay:{ [day]:400 } }, day, events), 400,
  'saved daily total takes precedence without double counting events');
assert.equal(report.drivingMilesForDay({ ...state, manualMilesByDay:{ [day]:null } }, day, events), 305.75,
  'null mileage is not zero');
const incompleteMiles = events.map(event => event.id === 'return' ? { ...event, manualMiles:undefined } : event);
assert.equal(report.drivingMilesForDay(state, day, incompleteMiles), null, 'partial driving miles are not presented as a complete total');
assert.equal(report.drivingMilesForDay(state, day, []), null, 'empty day has no invented miles');
assert.equal(report.drivingMilesForDay(state, day, [{ status:'OFF', startMin:0, endMin:1440 }]), 0,
  'complete non-driving day shows zero miles');
const gapState = { ...state, eventsByDay:{ [day]:[{ id:'gap', status:'D', startMin:60, endMin:120 }] } };
const gapRows = report.reportEventsForDay(gapState, day);
assert.equal(gapRows.length, 1);
assert.equal(gapRows[0].startMin, 60, 'export does not create an unrecorded midnight bridge');
assert.equal(gapRows[0].endMin, 120, 'export does not fill historical gaps to midnight');
assert.equal(report.reportEventsForDay({ ...state, currentStatus:'D' }, today).length, 0,
  'empty current day must not acquire an inferred status');
const liveState = { ...state, currentStatus:'ON', eventsByDay:{ [today]:[
  { id:'live', status:'ON', source:'live_status', startMin:0, endMin:1 },
] } };
const liveRows = report.reportEventsForDay(liveState, today);
const minute = nowMin('America/New_York');
assert.equal(liveRows.length ? liveRows[0].endMin : 0, minute, 'identified current event continues to current terminal time');
assert.equal(liveState.eventsByDay[today][0].endMin, 1, 'live projection leaves the stored record untouched');
const hiddenRows = report.reportEventsForDay({ ...state, eventsByDay:{ [day]:[
  ...events, { ...events[0], id:'deleted', voided:true }, { ...events[0], id:'suggested', displayOnly:true },
] } }, day);
assert.equal(hiddenRows.length, events.length, 'voided and display-only suggestions are excluded');
const escaped = report.dayReportHtml({ ...state, formByDay:{ [day]:{ driverName:'<script>alert(1)</script>' } } }, day);
assert.doesNotMatch(escaped, /<script>/, 'user fields are escaped in shared officer markup');
assert.ok(escaped.includes('&lt;script&gt;'));
const recert = report.dayReportHtml({ ...state, signatureByDay:{ [day]:{
  signed:true, needsRecertification:true, signatureDataUrl:'data:image/png;base64,AAAA',
} } }, day);
assert.ok(recert.includes('Not signed'));
assert.doesNotMatch(recert, /<img /, 'stale certification never displays a valid signature');
const certifiedState = { ...state, signatureByDay:{ [day]:createCertificationRecord(state, day, {
  signatureDataUrl:'data:image/png;base64,AAAA',
}) } };
const certifiedHtml = report.dayReportHtml(certifiedState, day);
assert.ok(certifiedHtml.includes('<small>Signed</small>') && certifiedHtml.includes('<img '), 'unchanged certified content retains its signature');
const editedForm = applyDayFormEdit(certifiedState, certifiedState, { truck:'229' }, day);
assert.equal(editedForm.signatureByDay[day].needsRecertification, undefined, 'canonical form edits do not require the legacy flag');
for (const changed of [editedForm, { ...certifiedState, eventsByDay:{ [day]:events.map(event =>
  event.id === 'on' ? { ...event, note:'Corrected pre-trip' } : event
) } }]) {
  const saved = JSON.stringify(changed);
  const changedHtml = report.dayReportHtml(changed, day);
  assert.ok(changedHtml.includes('<small>Not signed</small>'), 'changed certified content requires a fresh signature');
  assert.doesNotMatch(changedHtml, /<img /, 'fingerprint mismatch hides the old signature image');
  assert.equal(JSON.stringify(changed), saved, 'certification review does not rewrite the saved attestation');
}
const movedTerminal = { ...certifiedState, homeTerminalTimeZone:'America/Los_Angeles' };
const historicalHtml = report.dayReportHtml(movedTerminal, day);
assert.ok(historicalHtml.includes('America/New_York') && historicalHtml.includes('Start (EDT)'), 'historical report keeps the certified home-terminal zone');
assert.ok(historicalHtml.includes('<small>Signed</small>'), 'changing the current terminal does not invalidate historical facts');
assert.doesNotMatch(historicalHtml, /America\/Los_Angeles/);
assert.match(source, /<DailyPaper state=\{state\} day=\{selectedDay\}/, 'officer view shares the daily report');
assert.match(source, /<style>\$\{dailyLogStyleText\(\)\}<\/style>/, 'export includes the same daily styles');
assert.match(source, /@media screen and \(max-width:760px\)/,
  'phone-only layout must not leak into printing');
assert.match(source, /\.graph-wrap \.report-svg\{width:930px;max-width:none\}/,
  'phone graph must remain readable with horizontal review');
assert.match(source, /@page\{size:Letter portrait;margin:\.35in\}/,
  'printed roadside package must use an explicit Letter page');
assert.match(source, /payload\.replace\(\/\\s\+\/g, ''\)/,
  'embedded document decoder must remove whitespace without deleting letters');

console.log('PASS — minimal manual RODS fields, actual miles, right-side totals, history, escaping, signatures and read-only export');
