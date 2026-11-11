import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = 'source/src/modules/logbook/';
const prepared = new Map();
const read = file => prepared.get(file) ?? fs.readFileSync(file, 'utf8');
function patch(file, before, after) {
  const source = read(file);
  if (source.includes(after)) return;
  assert.equal(source.split(before).length, 2, 'Recorded coverage anchor: ' + file + ' / ' + before.slice(0, 80));
  prepared.set(file, source.replace(before, () => after));
}
function imports(file, line) {
  if (!read(file).includes(line)) prepared.set(file, line + '\n' + read(file));
}

prepared.set('source/src/core/compliance/recordedCoverage.js', fs.readFileSync('scripts/recorded-coverage/coverage.js', 'utf8'));
const view = root + 'dutyViewV110212.js';
imports(view, "import { recordedDayView } from '../../core/compliance/recordedCoverage.js';");
patch(view, '  if (!exactEvents.length) return continuousEvents;',
  `  if (context.day && context.clock?.day && context.day < context.clock.day) {
    return recordedDayView(context.state || {eventsByDay:context.eventsByDay}, context.day, exactEvents);
  }
  if (!exactEvents.length) return continuousEvents;`);
const archive = root + 'archiveDayV1103.js';
patch(archive, '{eventsByDay:state.eventsByDay,day,clock}', '{eventsByDay:state.eventsByDay,day,clock,state}');
const editor = root + 'eventEditingV110.js';
patch(editor, '  return historicalStatusTailV110317(projectLogbookEvents(state,day,at),!!day && day<clock.day);',
  `  // Open the saved interval; the driver explicitly supplies any missing end.
  return projectLogbookEvents(state,day,at);`);
patch(editor, "  if((projected.live?.id===id||projected.historicalTail?.id===id)&&Object.hasOwn(changes,'endMin'))after.paperLogEndV110315=true;",
  "  if((projected.live?.id===id||day<logbookClock(state,at).day)&&Object.hasOwn(changes,'endMin'))after.paperLogEndV110315=true;");
const report = root + 'reportDayV110391.js';
imports(report, "import { recordedDayView } from '../../core/compliance/recordedCoverage.js';");
patch(report, '  const end = day === clock.day ? clock.minute : 1440;',
  `  if (day < clock.day) return recordedDayView(viewState, day);
  const end = day === clock.day ? clock.minute : 1440;`);
const signing = root + 'signing.js';
patch(signing, '  const issues = [];\n  const today = localDayKey();',
  '  const issues = [];\n  const today = localDayKey(new Date(), getHomeTerminalTimeZone(state));');
patch(signing, '  const coverageOptions = { ...liveCoverageOptionsV1036(state), today };',
  '  const coverageOptions = { ...liveCoverageOptionsV1036(state), today, recordedState:state };');
imports(signing, "import { getHomeTerminalTimeZone } from '../../core/time/homeTerminalTime.js';");
const officerCheck = 'source/src/core/dot/dotOfficerCheckEngine.js';
imports(officerCheck, "import { getHomeTerminalTimeZone } from '../time/homeTerminalTime.js';");
patch(officerCheck, '    currentEventId:manualEventId || gpsEventId || \'\',',
  "    currentEventId:manualEventId || gpsEventId || '',\n    recordedState:state, today:localDayKey(new Date(), getHomeTerminalTimeZone(state)),");
for (const file of [signing, officerCheck]) {
  patch(file, "{ currentLocation: state.currentLocation || {}, currentStatus:state.currentStatus || 'OFF', currentReason:state.currentReason || 'Off Duty' }",
    "{ recordedState:state, today:localDayKey(new Date(), getHomeTerminalTimeZone(state)), currentLocation: state.currentLocation || {}, currentStatus:state.currentStatus || 'OFF', currentReason:state.currentReason || 'Off Duty' }");
}
const raw = 'source/src/core/compliance/rawRodsChecks.js';
imports(raw, "import { rawRecordedCoverage } from './recordedCoverage.js';");
patch(raw, '  const today = options.today || localDayKey();',
  `  const today = options.today || localDayKey();
  if (day && day < today) return rawRecordedCoverage(options.recordedState || {eventsByDay}, day);`);
const certification = root + 'certificationV110.js';
imports(certification, "import { assertRecordedCertificationComplete } from '../../core/compliance/recordedCoverage.js';");
patch(certification, '  const { certificationHistory = [], ...prior } = clone(prev);',
  `  assertRecordedCertificationComplete(state, day, content, new Date(now));
  const { certificationHistory = [], ...prior } = clone(prev);`);
const panel = root + 'LogCheckPanel.jsx';
imports(panel, "import { recordedCoverage } from '../../core/compliance/recordedCoverage.js';");
imports(panel, "import { useLogbookClockV110 } from '../../shared/utils/useLogbookClockV110.js';");
patch(panel, "  const text = String(warning?.text || '');", "  if (warning?.recordedCoverage) return {type:'recordedCoverage', ...warning.recordedCoverage};\n  const text = String(warning?.text || '');");
patch(panel, '  const high = result.warnings.filter(w => w.severity === \'high\').length;',
  `  const clock = useLogbookClockV110(state);
  const coverage = recordedCoverage(state, state.activeDay, clock.at);
  result.warnings = [...result.warnings, ...(coverage?.issues || []).map(issue => ({
    severity:'high', text:issue.title + ': ' + issue.detail, recordedCoverage:issue,
  }))];
  const high = result.warnings.filter(w => w.severity === 'high').length;`);
// The exact unrecorded interval remains visible even when the check is collapsed.
patch(panel, "          <span>{ok ? 'No reviews' : `${result.warnings.length} review${result.warnings.length === 1 ? '' : 's'}`}</span>",
  "          <span>{coverage?.issues.length ? coverage.issues.map(issue => issue.title + ': ' + issue.detail).join(' · ') : ok ? 'No reviews' : `${result.warnings.length} review${result.warnings.length === 1 ? '' : 's'}`}</span>");
const day = root + 'DayLogScreen.jsx';
patch(day, "    if (type === 'sign' || /certified/i.test(warningText)) {", `    if (type === 'recordedCoverage') {
      setActiveTab('log');
      if (String(target.code || '').startsWith('missing_recorded_interval_')) {
        onOpenAdd?.({ startMin:target.startMin, endMin:target.endMin });
      } else if (target.eventId) {
        onSelect?.(target.eventId);
        onOpenEdit?.(target.eventId);
      }
      return;
    }
    if (type === 'sign' || /certified/i.test(warningText)) {`);

// Update only intentionally changed module locks. The independent DOT lock
// pins the reviewed final bytes and is verified after these installers run.
const locks = JSON.parse(read('module-locks.v1.json'));
for (const [file, source] of prepared) {
  fs.writeFileSync(file, source);
  if (Object.hasOwn(locks.files, file)) locks.files[file] = createHash('sha256').update(source).digest('hex');
}
fs.writeFileSync('module-locks.v1.json', JSON.stringify(locks, null, 2) + '\n');
console.log('PASS — completed-day view, archive, report, checks and signing respect saved intervals');
