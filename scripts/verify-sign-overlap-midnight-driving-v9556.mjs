import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rawStoredEventsForDay } from '../source/src/core/compliance/rawRodsChecks.js';
import { displayEventsForDayFromState } from '../source/src/core/timeline/displayTimeline.js';

let checks = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  checks += 1;
  console.log(`✓ ${message}`);
}

console.log('verify-sign-overlap-midnight-driving-v9556');

const day = '2026-07-05';

const withSyntheticCarryover = {
  [day]: [
    { id: 'bad_carry_d', status: 'D', startMin: 0, endMin: 600, city: 'Willowbrook', state: 'IL', source: 'carryover' },
    { id: 'real_on', status: 'ON', startMin: 653, endMin: 668, city: 'Willowbrook', state: 'IL', note: 'Pre-trip Inspection', source: 'live_status' },
    { id: 'real_d', status: 'D', startMin: 668, endMin: 669, city: 'Willowbrook', state: 'IL', note: 'Driving', source: 'manual' },
  ],
};

const raw = rawStoredEventsForDay(withSyntheticCarryover, day);
ok(raw.length === 2, 'rawStoredEventsForDay removes source: carryover DRIVING rows');
ok(raw[0].status === 'ON' && raw[0].startMin === 653, 'real ON Pre-trip remains after purging carryover');
ok(raw[1].status === 'D' && raw[1].startMin === 668, 'real Driving remains after ON Pre-trip');
ok(!raw.some(e => e.startMin === 0 && e.status === 'D'), 'no raw midnight DRIVING survives from carryover');

const withDisplayRows = {
  [day]: [
    { id: 'display_d', status: 'D', startMin: 0, endMin: 600, city: 'Willowbrook', state: 'IL', source: 'display' },
    { id: 'timeline_d', status: 'D', startMin: 0, endMin: 600, city: 'Willowbrook', state: 'IL', source: 'display_timeline' },
    { id: 'real_on2', status: 'ON', startMin: 653, endMin: 668, city: 'Willowbrook', state: 'IL', note: 'Pre-trip Inspection' },
  ],
};
const raw2 = rawStoredEventsForDay(withDisplayRows, day);
ok(raw2.length === 1 && raw2[0].id === 'real_on2', 'display/display_timeline rows are not raw RODS events');

const displayed = displayEventsForDayFromState(withSyntheticCarryover, day, { nowMinute: 670 });
ok(!displayed.some(e => e.status === 'D' && e.startMin === 0), 'display timeline ignores source: carryover midnight Driving');
ok(displayed.some(e => e.status === 'ON'), 'display timeline still shows real ON event');

const appSrc = fs.readFileSync('source/src/app/App.jsx', 'utf8');
ok(appSrc.includes('purgeSyntheticAndRepairEvents'), 'App uses central purge/repair helper');
ok(appSrc.includes('repairMidnightDrivingCorruption'), 'App includes midnight Driving repair guard');
ok(appSrc.includes("String(current[0]?.source || '') === 'carryover'"), 'stale carryover-only placeholders are removed');
ok(appSrc.includes('carry-forward is display-only'), 'ensureTodayCarryover documents display-only behavior');
ok(appSrc.includes('repair_midnight_driving'), 'repair guard marks repaired rows for audit/debug');
ok(!appSrc.includes("String(event.source || '') !== 'timeline_continuity'"), 'old narrow synthetic filter was removed from commit path');

const rawSrc = fs.readFileSync('source/src/core/compliance/rawRodsChecks.js', 'utf8');
ok(rawSrc.includes("source === 'carryover'"), 'raw checks filter carryover source');
ok(rawSrc.includes("source === 'display'"), 'raw checks filter display source');
ok(rawSrc.includes("source === 'display_timeline'"), 'raw checks filter display_timeline source');

const displaySrc = fs.readFileSync('source/src/core/timeline/displayTimeline.js', 'utf8');
ok(displaySrc.includes("String(event.source || '') === 'carryover'"), 'display base filters carryover source');
ok(displaySrc.includes("String(event.source || '') === 'display_timeline'"), 'display base filters display_timeline source');

console.log(`\n${checks} checks PASS`);
