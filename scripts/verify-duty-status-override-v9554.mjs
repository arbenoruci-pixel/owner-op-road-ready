#!/usr/bin/env node
// v95.54 — Duty-status override fix verifier.
//
// Asserts, offline (no npm registry / no build):
//  1. Adding DRIVING after an ON DUTY Pre-trip never mutates or deletes the ON event.
//  2. The reported bug (backdated D insert fully covering the raw ON row) is fixed
//     by protectLiveTailFromInsert.
//  3. Overlap inserts only replace the overlapped part (TEST 3 / TEST 4).
//  4. Live Status->Driving flow closes ON at drive start with a NEW event id (TEST 2).
//  5. No synthetic / carry-forward rows survive the write filters (TEST 6).
//  6. Static: write paths in App.jsx use the raw stored base, never the display
//     timeline, and the driver-workflow / motion paths strip synthetic rows.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engineUrl = new URL('../source/src/core/timeline/timelineEngine.js', import.meta.url);
const rawUrl = new URL('../source/src/core/compliance/rawRodsChecks.js', import.meta.url);

const {
  insertManyOverride,
  insertEventOverride,
  closePreviousAndStart,
  normalizeLogEvents,
  protectLiveTailFromInsert,
  makeContinuousLogEvents,
} = await import(engineUrl.href);
const { rawStoredEventsForDay, stripSyntheticEventFields } = await import(rawUrl.href);

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function fmt(events) {
  return (events || []).map(e => `${e.status} ${e.startMin}-${e.endMin} (${e.id})`).join(' | ');
}
const MIN = (h, m) => h * 60 + m;

console.log('verify-duty-status-override-v9554');

// ---------------------------------------------------------------------------
console.log('\nTEST 1 — explicit OFF / ON / D inserts stay separate');
{
  let evs = [];
  evs = insertManyOverride(evs, [{ id: 'off1', status: 'OFF', startMin: 0, endMin: MIN(9, 13), note: 'Off Duty' }]);
  evs = insertManyOverride(evs, [{ id: 'on1', status: 'ON', startMin: MIN(9, 13), endMin: MIN(9, 28), note: 'Pre-trip Inspection' }]);
  evs = insertManyOverride(evs, [{ id: 'd1', status: 'D', startMin: MIN(9, 28), endMin: MIN(10, 0), note: 'Driving' }]);
  const statuses = evs.map(e => `${e.status}:${e.startMin}-${e.endMin}`).join(',');
  check('raw timeline OFF/ON/D', statuses === `OFF:0-${MIN(9, 13)},ON:${MIN(9, 13)}-${MIN(9, 28)},D:${MIN(9, 28)}-${MIN(10, 0)}`, fmt(evs));
  check('ON kept its id', evs.some(e => e.id === 'on1' && e.status === 'ON'));
  check('D has its own id', evs.some(e => e.id === 'd1' && e.status === 'D'));
  check('D does not start at 00:00', !evs.some(e => e.status === 'D' && e.startMin === 0));
}

// ---------------------------------------------------------------------------
console.log('\nTEST 2 — live flow: ON Pre-trip now, Drive 15 min later (closePreviousAndStart)');
{
  // closeLastAndAddStatus stores a live ON as start..start+1 and later extends
  // it to the drive start via closePreviousAndStart.
  let evs = normalizeLogEvents(closePreviousAndStart([], {
    id: 'live_on', status: 'ON', startMin: MIN(9, 13), endMin: MIN(9, 14), note: 'Pre-trip inspection', source: 'live_status',
  }));
  evs = normalizeLogEvents(closePreviousAndStart(evs, {
    id: 'live_d', status: 'D', startMin: MIN(9, 28), endMin: MIN(9, 29), note: 'Driving started', source: 'live_status',
  }));
  const on = evs.find(e => e.status === 'ON');
  const d = evs.find(e => e.status === 'D');
  check('ON survives and closes at drive start', !!on && on.id === 'live_on' && on.startMin === MIN(9, 13) && on.endMin === MIN(9, 28), fmt(evs));
  check('D is a new event id starting at drive start', !!d && d.id === 'live_d' && d.startMin === MIN(9, 28));
  check('no event reused the ON id with a new status', !evs.some(e => e.id === 'live_on' && e.status !== 'ON'));
}

// ---------------------------------------------------------------------------
console.log('\nREGRESSION — reported bug: backdated D insert over live ON sliver');
{
  // Raw stored day after a live "ON Pre-trip" tap at 9:13: one 1-minute row.
  const base = normalizeLogEvents([{ id: 'live_on', status: 'ON', startMin: MIN(9, 13), endMin: MIN(9, 14), note: 'Pre-trip inspection', source: 'live_status' }]);
  // Old insert-sheet default at 9:28 was "15 min ago": D 9:13–9:28, which fully
  // covered the ON row and deleted it. The guard must keep the ON.
  const incoming = protectLiveTailFromInsert(base, [{ id: 'ev_d', status: 'D', startMin: MIN(9, 13), endMin: MIN(9, 28), note: 'Driving', source: 'manual' }]);
  const evs = insertManyOverride(base, incoming);
  const on = evs.find(e => e.status === 'ON');
  const d = evs.find(e => e.status === 'D');
  check('ON is NOT deleted by the covering D insert', !!on && on.id === 'live_on' && on.status === 'ON', fmt(evs));
  check('D starts after the stored ON row, not before it', !!d && d.startMin >= on.endMin - 0, fmt(evs));
  check('no D covers 9:13 (pre-trip start stays ON)', !evs.some(e => e.status === 'D' && e.startMin <= MIN(9, 13)));
}
{
  // Same bug with a full 15-minute ON (added with the "15m ago" chip), then an
  // exactly-covering D insert extended past it must also keep the ON.
  const base = normalizeLogEvents([{ id: 'on_full', status: 'ON', startMin: MIN(9, 13), endMin: MIN(9, 28), note: 'Pre-trip inspection' }]);
  const incoming = protectLiveTailFromInsert(base, [{ id: 'ev_d', status: 'D', startMin: MIN(9, 13), endMin: MIN(10, 0), note: 'Driving' }]);
  const evs = insertManyOverride(base, incoming);
  const on = evs.find(e => e.status === 'ON');
  const d = evs.find(e => e.status === 'D');
  check('full-width ON kept, D moved to ON end', !!on && on.endMin === MIN(9, 28) && !!d && d.startMin === MIN(9, 28), fmt(evs));
}
{
  // Explicit exact overwrite of the same block is still allowed.
  const base = normalizeLogEvents([{ id: 'on1', status: 'ON', startMin: MIN(9, 0), endMin: MIN(9, 30), note: 'Pre-trip inspection' }]);
  const incoming = protectLiveTailFromInsert(base, [{ id: 'd1', status: 'D', startMin: MIN(9, 0), endMin: MIN(9, 30), note: 'Driving' }]);
  const evs = insertManyOverride(base, incoming);
  check('exact-cover replacement still allowed', evs.length === 1 && evs[0].status === 'D' && evs[0].id === 'd1', fmt(evs));
}

// ---------------------------------------------------------------------------
console.log('\nTEST 3 — overlap only replaces the overlap');
{
  const base = normalizeLogEvents([{ id: 'on1', status: 'ON', startMin: MIN(9, 0), endMin: MIN(9, 30), note: 'Pre-trip inspection' }]);
  const incoming = protectLiveTailFromInsert(base, [{ id: 'd1', status: 'D', startMin: MIN(9, 15), endMin: MIN(10, 0), note: 'Driving' }]);
  const evs = insertManyOverride(base, incoming);
  const on = evs.find(e => e.status === 'ON');
  const d = evs.find(e => e.status === 'D');
  check('ON trimmed to 9:00–9:15', !!on && on.startMin === MIN(9, 0) && on.endMin === MIN(9, 15), fmt(evs));
  check('D is 9:15–10:00', !!d && d.startMin === MIN(9, 15) && d.endMin === MIN(10, 0));
  check('no D 9:00–10:00', !evs.some(e => e.status === 'D' && e.startMin === MIN(9, 0)));
}

// ---------------------------------------------------------------------------
console.log('\nTEST 4 — no overlap, nothing changes');
{
  const base = normalizeLogEvents([{ id: 'on1', status: 'ON', startMin: MIN(9, 0), endMin: MIN(9, 15), note: 'Pre-trip inspection' }]);
  const incoming = protectLiveTailFromInsert(base, [{ id: 'd1', status: 'D', startMin: MIN(9, 15), endMin: MIN(10, 0), note: 'Driving' }]);
  const evs = insertManyOverride(base, incoming);
  const on = evs.find(e => e.status === 'ON');
  check('ON unchanged', !!on && on.id === 'on1' && on.startMin === MIN(9, 0) && on.endMin === MIN(9, 15), fmt(evs));
  check('D untouched by guard', evs.some(e => e.id === 'd1' && e.startMin === MIN(9, 15) && e.endMin === MIN(10, 0)));
}

// ---------------------------------------------------------------------------
console.log('\nTEST 5 — inspection link key survives (ON id unchanged after D insert)');
{
  const base = normalizeLogEvents([{ id: 'on_pretrip', status: 'ON', startMin: MIN(9, 13), endMin: MIN(9, 28), note: 'Pre-trip inspection' }]);
  const inspection = { sourceEventId: 'on_pretrip' };
  const incoming = protectLiveTailFromInsert(base, [{ id: 'd1', status: 'D', startMin: MIN(9, 28), endMin: MIN(10, 0), note: 'Driving' }]);
  const evs = insertManyOverride(base, incoming);
  const on = evs.find(e => e.status === 'ON');
  check('inspection.sourceEventId still matches the ON event', !!on && on.id === inspection.sourceEventId, fmt(evs));
}

// ---------------------------------------------------------------------------
console.log('\nTEST 6 — synthetic / carry-forward rows never pass the write filters');
{
  const day = '2026-07-05';
  const eventsByDay = {
    [day]: [
      { id: 'carry_1', status: 'OFF', startMin: 0, endMin: 1, carriedFromPreviousDay: true, source: 'carryover' },
      { id: 'syn_1', status: 'OFF', startMin: 1, endMin: 60, syntheticCoverage: true },
      { id: 'cont_1', status: 'OFF', startMin: 60, endMin: 120, source: 'timeline_continuity' },
      { id: 'real_on', status: 'ON', startMin: MIN(9, 13), endMin: MIN(9, 28), note: 'Pre-trip inspection' },
    ],
  };
  const raw = rawStoredEventsForDay(eventsByDay, day);
  check('rawStoredEventsForDay keeps only real rows', raw.length === 1 && raw[0].id === 'real_on', fmt(raw));
  const display = makeContinuousLogEvents(raw, { isCurrentDay: true, nowMinute: MIN(10, 0), fillStartWith: 'OFF' });
  const written = display
    .filter(e => !e.syntheticCoverage && !e.carriedFromPreviousDay && String(e.source || '') !== 'timeline_continuity')
    .map(stripSyntheticEventFields);
  check('display fill rows are filtered before any save', written.every(e => !e.syntheticCoverage && !e.carriedFromPreviousDay && e.source !== 'timeline_continuity'));
  check('stripSyntheticEventFields removes the flags', !('syntheticCoverage' in stripSyntheticEventFields({ syntheticCoverage: true, carriedFromPreviousDay: true, id: 'x' })));
}

// ---------------------------------------------------------------------------
console.log('\nSTATIC — write paths use raw stored base, never the display timeline');
{
  const appSrc = readFileSync(path.join(root, 'source/src/app/App.jsx'), 'utf8');

  function fnBody(name) {
    const start = appSrc.indexOf(`function ${name}(`);
    if (start < 0) return '';
    // crude but stable: read to the next top-level "  function " sibling
    const rest = appSrc.slice(start);
    const next = rest.slice(10).search(/\n  function [A-Za-z]/);
    return next > 0 ? rest.slice(0, next + 10) : rest;
  }

  const writeFns = ['addEvent', 'updateEvent', 'deleteEvent', 'applyShift', 'addDriverWorkflowEvents', 'closeLastAndAddStatus', 'stopDrivingToOnDuty', 'startDrivingFromMotion'];
  for (const name of writeFns) {
    const body = fnBody(name);
    check(`${name} exists`, body.length > 0);
    check(`${name} does not use displayEventsForDayFromState as write base`, !body.includes('displayEventsForDayFromState'));
    check(`${name} does not use buildDisplayTimeline`, !body.includes('buildDisplayTimeline'));
    check(`${name} uses raw stored base`, /continuousBaseForDay|rawStoredEventsForDay/.test(body), 'expected continuousBaseForDay/rawStoredEventsForDay');
  }

  for (const name of ['addEvent', 'addDriverWorkflowEvents', 'startDrivingFromMotion', 'stopDrivingToOnDuty']) {
    const body = fnBody(name);
    check(`${name} strips synthetic rows on save (commitTimelineForDay)`, body.includes('commitTimelineForDay('));
  }

  for (const name of ['addEvent', 'addDriverWorkflowEvents']) {
    const body = fnBody(name);
    check(`${name} applies protectLiveTailFromInsert`, body.includes('protectLiveTailFromInsert('));
  }

  const sheetSrc = readFileSync(path.join(root, 'source/src/modules/editor/InsertEditEventSheet.jsx'), 'utf8');
  check('insert sheet uses safeDefaultStart', sheetSrc.includes('safeDefaultStart(events)'));
  check('safeDefaultStart checks events overlapping the backdate window', sheetSrc.includes('overlapsBackdateWindow') && sheetSrc.includes('end > backdated') && sheetSrc.includes('start < now'));
}

// ---------------------------------------------------------------------------
console.log('');
if (failures) {
  console.error(`verify-duty-status-override-v9554: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('verify-duty-status-override-v9554: all checks passed');
