import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '100.1.0';
const RELEASED_AT = '2026-07-15T04:30:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v100.1 missing ${label}`);
  return content.replace(before, after);
}

const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
app = replaceOnce(
  app,
  "import { insertManyOverride, applyEditOverride, applyPatchWithNeighbors, normalizeLogEvents, protectLiveTailFromInsert, shiftSelectedEventsForDay } from '../core/timeline/timelineEngine.js';",
  "import { insertManyOverride, applyEditOverride, applyPatchWithNeighbors, normalizeLogEvents, protectLiveTailFromInsert } from '../core/timeline/timelineEngine.js';\nimport { resolveRawShiftSelectionV101, shiftSelectedEventsV101 } from '../core/timeline/multiEventShiftV101.js';",
  'App multi-event shift import'
);
app = replaceOnce(
  app,
  "  const rawEvents = useMemo(() => rawStoredEventsForDay(state.eventsByDay || {}, state.activeDay), [state.eventsByDay, state.activeDay]);\n  const events = useMemo(() => displayEventsForDayFromState(state.eventsByDay || {}, state.activeDay), [state.eventsByDay, state.activeDay]);\n  const liveCurrent = useMemo(() => currentFromEvents(events, state.currentStatus || 'OFF', state.currentLocation || { city:'GPS', state:'UNK' }, state.currentReason || 'Off Duty'), [events, state.currentStatus, state.currentLocation, state.currentReason]);",
  "  const rawEvents = useMemo(() => rawStoredEventsForDay(state.eventsByDay || {}, state.activeDay), [state.eventsByDay, state.activeDay]);\n  const events = useMemo(() => displayEventsForDayFromState(state.eventsByDay || {}, state.activeDay), [state.eventsByDay, state.activeDay]);\n  const resolvedShiftIds = useMemo(\n    () => resolveRawShiftSelectionV101(rawEvents, events, state.selectedIds || []),\n    [rawEvents, events, state.selectedIds]\n  );\n  const liveCurrent = useMemo(() => currentFromEvents(events, state.currentStatus || 'OFF', state.currentLocation || { city:'GPS', state:'UNK' }, state.currentReason || 'Off Duty'), [events, state.currentStatus, state.currentLocation, state.currentReason]);",
  'resolved display-to-raw shift selection'
);
app = replaceOnce(
  app,
  `  function applyShift(delta, options = {}) {
    setState(s => {
      const baseEvents = rawStoredEventsForDay(s.eventsByDay || {}, s.activeDay);
      const selectedIds = (s.selectedIds || []).filter(Boolean);
      const result = shiftSelectedEventsForDay(baseEvents, selectedIds, delta, { preserveCoverage:true, allowDrivingOnlyIfSelected:true });

      if (result.blockedReason || !result.appliedDeltaMin) {
        if (typeof window !== 'undefined') {
          window.setTimeout(() => window.alert?.(result.blockedReason || 'Shift was not applied.'), 0);
        }
        return { ...s, sheet:null, selectMode:true };
      }

      const evs = commitTimelineForDay(result.events, s.activeDay, s);
      const eventsByDay = { ...s.eventsByDay, [s.activeDay]: sorted(evs) };
      const recertNeeded = s.certifyStatus?.[s.activeDay] === 'Certified';
      const keepSelection = options?.keepSelection === true;
      let next = {
        ...s,
        eventsByDay,
        routeLegsByDay:syncRouteLegTimes(s.routeLegsByDay || {}, eventsByDay),
        sheet:null,
        selectMode:keepSelection ? true : false,
        selectedIds:keepSelection ? selectedIds : [],
        selectedEventId:(result.changedEventIds || [])[0] || null,
        lastShiftResult:{
          day:s.activeDay,
          appliedDeltaMin:result.appliedDeltaMin,
          changedEventIds:result.changedEventIds || [],
          adjustedNeighborIds:result.adjustedNeighborIds || [],
          warnings:result.warnings || [],
          mode:result.mode || 'selected_block',
          recertNeeded,
          at:Date.now(),
        },
      };
      next = reconcilePreTripInspections(next, [s.activeDay]);
      return markRecert(next);
    });
  }`,
  `  function applyShift(delta, options = {}) {
    setState(s => {
      const baseEvents = rawStoredEventsForDay(s.eventsByDay || {}, s.activeDay);
      const displayEvents = displayEventsForDayFromState(s.eventsByDay || {}, s.activeDay);
      const selectedIds = resolveRawShiftSelectionV101(baseEvents, displayEvents, (s.selectedIds || []).filter(Boolean));
      const result = shiftSelectedEventsV101(baseEvents, selectedIds, delta);

      if (result.blockedReason || !result.appliedDeltaMin) {
        if (typeof window !== 'undefined') {
          window.setTimeout(() => window.alert?.(result.blockedReason || 'Shift was not applied.'), 0);
        }
        return { ...s, sheet:null, selectMode:true };
      }

      const evs = commitTimelineForDay(result.events, s.activeDay, s);
      const eventsByDay = { ...s.eventsByDay, [s.activeDay]: sorted(evs) };
      const recertNeeded = s.certifyStatus?.[s.activeDay] === 'Certified';
      const keepSelection = options?.keepSelection === true;
      let next = {
        ...s,
        eventsByDay,
        routeLegsByDay:syncRouteLegTimes(s.routeLegsByDay || {}, eventsByDay),
        sheet:null,
        selectMode:keepSelection ? true : false,
        selectedIds:keepSelection ? selectedIds : [],
        selectedEventId:(result.changedEventIds || [])[0] || null,
        lastShiftResult:{
          day:s.activeDay,
          appliedDeltaMin:result.appliedDeltaMin,
          requestedDeltaMin:Math.round(Number(delta || 0)),
          changedEventIds:result.changedEventIds || [],
          adjustedNeighborIds:result.adjustedNeighborIds || [],
          warnings:result.warnings || [],
          mode:result.mode || 'selected_block_v101',
          recertNeeded,
          at:Date.now(),
        },
      };
      next = reconcilePreTripInspections(next, [s.activeDay]);
      return markRecert(next);
    });
  }`,
  'App applyShift reliable raw selection'
);
app = replaceOnce(
  app,
  "      {state.sheet?.type === 'shift' && <ShiftSheet events={rawEvents} selectedIds={state.selectedIds} onApply={applyShift} onClose={()=>setState(s=>({ ...s, sheet:null }))} />}",
  "      {state.sheet?.type === 'shift' && <ShiftSheet events={rawEvents} selectedIds={resolvedShiftIds} onApply={applyShift} onClose={()=>setState(s=>({ ...s, sheet:null }))} />}",
  'ShiftSheet resolved IDs'
);
write(appPath, app);

const shiftSheetPath = 'source/src/modules/editor/ShiftSheet.jsx';
let shiftSheet = read(shiftSheetPath);
shiftSheet = replaceOnce(
  shiftSheet,
  "import { shiftSelectedEventsForDay } from '../../core/timeline/timelineEngine.js';",
  "import { shiftSelectedEventsV101 } from '../../core/timeline/multiEventShiftV101.js';",
  'ShiftSheet engine import'
);
shiftSheet = shiftSheet.replace(/shiftSelectedEventsForDay\(events, selectedIds, delta, \{ preserveCoverage:true, allowDrivingOnlyIfSelected:true \}\)/g, 'shiftSelectedEventsV101(events, selectedIds, delta)');
write(shiftSheetPath, shiftSheet);

const dayPath = 'source/src/modules/logbook/DayLogScreen.jsx';
let day = read(dayPath);
if (day.includes('shiftSelectedEventsForDay')) {
  day = day.replace(
    "import { normalizeLogEvents, shiftSelectedEventsForDay } from '../../core/timeline/timelineEngine.js';",
    "import { normalizeLogEvents } from '../../core/timeline/timelineEngine.js';\nimport { shiftSelectedEventsV101 } from '../../core/timeline/multiEventShiftV101.js';"
  );
  day = day.replace(/shiftSelectedEventsForDay\(/g, 'shiftSelectedEventsV101(');
}
write(dayPath, day);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v100.1-reliable-multi-event-shift-restore',
  releasedAt:RELEASED_AT,
  notes:[
    'Restores multi-event movement after selecting several Logbook rows, including separated selections.',
    'Maps continuous display rows back to every underlying raw stored event before preview and save.',
    'Treats an all-selected partial-day block as a normal movable block instead of incorrectly requiring full-day coverage.',
    'Moves by the full requested amount when possible and otherwise moves by the maximum available minutes instead of doing nothing.',
    'Preserves selected event durations, adjusts only neighboring boundaries, recalculates route times, and flags signed days for recertification.',
    'Preserves v100 Pro Document Inbox, PDF/photo import, Mudflap reader, Logbook linking, HOS, and DOT data.'
  ],
  label:'v100.1 Reliable Multi-event Move Restore',
  updatedAt:RELEASED_AT
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyApp = read(appPath);
const verifySheet = read(shiftSheetPath);
if (!verifyApp.includes('resolveRawShiftSelectionV101') || !verifyApp.includes('shiftSelectedEventsV101') || !verifyApp.includes('selectedIds={resolvedShiftIds}')) {
  throw new Error('v100.1 App integration failed');
}
if (!verifySheet.includes('shiftSelectedEventsV101')) throw new Error('v100.1 ShiftSheet integration failed');
console.log('v100.1 reliable multi-event movement materialized');
