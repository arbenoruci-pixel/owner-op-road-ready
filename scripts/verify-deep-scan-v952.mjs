// v95.2 deep-scan patch verifier (offline, no build needed):
//   node scripts/verify-deep-scan-v952.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildContinuousTimeline } from '../source/src/core/hos/hosEngine.js';
import {
  insertEventOverride,
  normalizeLogEvents,
  makeContinuousLogEvents,
  closePreviousAndStart,
} from '../source/src/core/timeline/timelineEngine.js';

let checks = 0;
function ok(name, fn) {
  fn();
  checks += 1;
  console.log(`PASS ${name}`);
}

function dayKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 1) HOS: today is always the open day, even when reviewing a past day.
ok('hos: no phantom drive time to midnight while reviewing a past day', () => {
  const today = dayKey(0);
  const yesterday = dayKey(-1);
  const now = new Date();
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const driveStart = Math.max(1, nowMinute - 30);
  const eventsByDay = {
    [yesterday]: [
      { id: 'sb', status: 'SB', startMin: 0, endMin: 600, note: 'Sleeper' },
      { id: 'off', status: 'OFF', startMin: 600, endMin: 1440, note: 'Off Duty' },
    ],
    [today]: [
      { id: 't_off', status: 'OFF', startMin: 0, endMin: driveStart, note: 'Off Duty' },
      { id: 't_d', status: 'D', startMin: driveStart, endMin: Math.min(1439, driveStart + 1), note: 'Driving' },
    ],
  };
  const timeline = buildContinuousTimeline(eventsByDay, yesterday);
  const todayDrive = timeline
    .filter(e => e.dayKey === today && e.status === 'D')
    .reduce((sum, e) => sum + (e.endAbs - e.startAbs), 0);
  assert.ok(todayDrive <= 40, `today's driving counted as ${todayDrive} min; expected ~30 (no midnight extension)`);
});

// 2) Timeline: ON inserted inside OFF splits cleanly, no gaps/overlaps, notes do not leak.
ok('timeline: ON inside OFF splits and OFF resumes, no stale note', () => {
  const out = insertEventOverride(
    [{ id: 'off', status: 'OFF', startMin: 0, endMin: 1440, note: 'Off Duty' }],
    { id: 'on1', status: 'ON', startMin: 480, endMin: 540, note: 'Pre-trip inspection' }
  );
  const sorted = [...out].sort((a, b) => a.startMin - b.startMin);
  assert.equal(sorted.length, 3);
  for (let i = 0; i < sorted.length - 1; i += 1) assert.equal(sorted[i].endMin, sorted[i + 1].startMin);
  assert.equal(sorted[0].startMin, 0);
  assert.equal(sorted[2].endMin, 1440);
  assert.ok(!/pre[- ]?trip/i.test(sorted[2].note || ''));
});

// 3) Timeline: live status change carries previous status forward (no gap).
ok('timeline: closePreviousAndStart leaves no gap', () => {
  const out = closePreviousAndStart(
    [{ id: 'off', status: 'OFF', startMin: 0, endMin: 300, note: 'Off Duty' }],
    { id: 'on', status: 'ON', startMin: 500, endMin: 501, note: 'Pickup / Loading' }
  );
  const sorted = [...out].sort((a, b) => a.startMin - b.startMin);
  assert.equal(sorted[0].endMin, sorted[1].startMin);
});

// 4) Timeline: completed day extends to 1440, current day only to now.
ok('timeline: completed day 0-1440, current day 0-now', () => {
  const base = [{ id: 'a', status: 'D', startMin: 60, endMin: 61, note: 'Driving' }];
  const done = makeContinuousLogEvents(base, { isCurrentDay: false, fillStartWith: 'OFF' });
  assert.equal(done[0].startMin, 0);
  assert.equal(done[done.length - 1].endMin, 1440);
  const live = makeContinuousLogEvents(base, { isCurrentDay: true, nowMinute: 200, fillStartWith: 'OFF' });
  assert.equal(live[live.length - 1].endMin, 200);
});

// 5) Timeline: 1-minute events survive normalization.
ok('timeline: 1-minute event preserved', () => {
  const out = normalizeLogEvents([
    { id: 'a', status: 'OFF', startMin: 0, endMin: 500, note: 'Off Duty' },
    { id: 'b', status: 'ON', startMin: 500, endMin: 501, note: 'Fuel' },
    { id: 'c', status: 'OFF', startMin: 501, endMin: 1440, note: 'Off Duty' },
  ]);
  assert.equal(out.length, 3);
});

// 6) Graph: no vertical dashed warning guide line in violation overlays.
ok('graph: violation overlay has no vertical dashed guide line', () => {
  const src = readFileSync(new URL('../source/src/modules/graph/LogGraph.jsx', import.meta.url), 'utf8');
  assert.ok(!src.includes('strokeDasharray="5 4"'), 'vertical dashed violation guide line still present');
});

// 7) Status sheet: manual location edits are protected from late auto-GPS.
ok('status sheet: manual location guarded against late auto-GPS fix', () => {
  const src = readFileSync(new URL('../source/src/modules/status/StatusWorkflowSheet.jsx', import.meta.url), 'utf8');
  assert.ok(src.includes('manualLocationDirty'), 'manualLocationDirty guard missing');
  assert.ok(src.includes('auto && manualLocationDirty.current'), 'auto GPS callback guard missing');
});

// 8) HOS source: the current-day rule is by calendar day only.
ok('hos source: isCurrentDay depends on today only, not activeDay', () => {
  const src = readFileSync(new URL('../source/src/core/hos/hosEngine.js', import.meta.url), 'utf8');
  assert.ok(!src.includes("dayKey === today && dayKey === activeDay"), 'old activeDay-coupled condition still present');
  assert.ok(src.includes('isCurrentDay: dayKey === today'), 'new condition missing');
});

console.log(`verify-deep-scan-v952: ${checks} checks passed`);
