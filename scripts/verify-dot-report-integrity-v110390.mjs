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
import { patchDotReportIntegrity } from './finalize-dot-report-integrity-v110390.mjs';

const source = fs.readFileSync('source/src/modules/dot/DotMode.jsx', 'utf8');
assert.equal(patchDotReportIntegrity(source), source, 'production installs the integrity finalizer idempotently');
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
  readLogbookDayState, certificationStatusV1032, validateLogForSigning,
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
console.log('PASS — real manual End edits for all four statuses, live Now, certification totals, daily signatures, frozen zones and read-only reports');
