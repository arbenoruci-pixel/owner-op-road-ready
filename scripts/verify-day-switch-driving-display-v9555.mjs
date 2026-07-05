#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { displayEventsForDayFromState } from '../source/src/core/timeline/displayTimeline.js';
import { rawStoredEventsForDay } from '../source/src/core/compliance/rawRodsChecks.js';

let checks = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}
function eq(actual, expected, message) {
  assert.equal(actual, expected, message);
  checks += 1;
}
function read(file) {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8');
}

const eventsByDay = {
  '2026-07-04': [
    { id:'prev_d', status:'D', startMin:1200, endMin:1440, city:'Gary', state:'IN', note:'Driving', source:'manual' },
  ],
  '2026-07-05': [
    { id:'on_pretrip', status:'ON', startMin:553, endMin:568, city:'Willowbrook', state:'IL', note:'Pre-trip inspection', source:'live_status' },
    { id:'drive', status:'D', startMin:568, endMin:600, city:'Willowbrook', state:'IL', note:'Driving', source:'manual' },
  ],
};

const displayed = displayEventsForDayFromState(eventsByDay, '2026-07-05', { nowMinute: 600 });
ok(displayed.length >= 3, 'display should include start coverage + ON + D');
eq(displayed[0].status, 'OFF', 'previous-day D must not carry forward as start-of-day D');
eq(displayed.find(e => e.id === 'on_pretrip')?.status, 'ON', 'ON Pre-trip must remain ON after display rebuild');
eq(displayed.find(e => e.id === 'drive')?.status, 'D', 'Driving event must remain D');
ok(!displayed.some(e => e.status === 'D' && Number(e.startMin) === 0 && e.source === 'timeline_continuity'), 'no synthetic D from midnight');

const withBadCarry = {
  '2026-07-05': [
    { id:'carry_bad', status:'D', startMin:0, endMin:1, city:'Gary', state:'IN', note:'Driving', source:'carryover', carriedFromPreviousDay:true },
    { id:'on_pretrip', status:'ON', startMin:553, endMin:568, city:'Willowbrook', state:'IL', note:'Pre-trip inspection', source:'live_status' },
    { id:'drive', status:'D', startMin:568, endMin:600, city:'Willowbrook', state:'IL', note:'Driving', source:'manual' },
  ],
};
const raw = rawStoredEventsForDay(withBadCarry, '2026-07-05');
eq(raw.length, 2, 'rawStoredEventsForDay must drop carried DRIVING row');
eq(raw[0].status, 'ON', 'first real raw event should be ON pre-trip');
const repairedDisplay = displayEventsForDayFromState(withBadCarry, '2026-07-05', { nowMinute: 600 });
eq(repairedDisplay[0].status, 'OFF', 'bad carried D row must not repaint day as Driving');
ok(!repairedDisplay.some(e => e.id === 'carry_bad'), 'carried D row ignored by display rebuild');

const app = read('source/src/app/App.jsx');
ok(app.includes('function safeCarryoverStatus'), 'App has safeCarryoverStatus guard');
ok(app.includes("return status === 'D' ? 'OFF'"), 'safeCarryoverStatus converts D to OFF');
ok(app.includes('const todayRawEvents = rawStoredEventsForDay(eventsByDay, today);'), 'normalizeState derives today real raw events');
ok(app.includes("(!currentFromRaw && s.currentStatus === 'D') ? 'OFF'"), 'normalizeState clears stale currentStatus D when no raw today');
ok(app.includes('function previousDayLastEvent') && app.includes('rawStoredEventsForDay(eventsByDay || {}, prevDay)'), 'previous-day carryover uses raw stored events only');

const display = read('source/src/core/timeline/displayTimeline.js');
ok(display.includes('function realDisplayBase'), 'displayTimeline has realDisplayBase');
ok(display.includes('event => !isDisplayOnlyCoverage(event)'), 'displayTimeline filters display/carryover rows');
ok(display.includes('safeCarryForwardStatus(previous?.status'), 'display start gap uses safe carry-forward status');
ok(display.includes("return status === 'D' ? 'OFF'"), 'display carry-forward D becomes OFF');

const home = read('source/src/modules/home/HomeScreen.jsx');
ok(home.includes("import { rawStoredEventsForDay }"), 'Home imports rawStoredEventsForDay');
ok(home.includes('function safeLiveStatus'), 'Home has safeLiveStatus');
ok(home.includes("return status === 'D' && !hasRawToday ? 'OFF'"), 'Home clears stale D when today has no raw log');
ok((home.match(/rawStoredEventsForDay/g) || []).length >= 4, 'Home uses raw stored events for status/log checks');

const insert = read('source/src/modules/editor/InsertEditEventSheet.jsx');
ok(insert.includes('overlapsBackdateWindow'), 'Insert sheet checks overlap with backdate window');
ok(insert.includes('start < now && end > backdated'), 'Insert sheet protects events overlapping 15-minute default window');

console.log(`verify-day-switch-driving-display-v9555: ${checks} checks PASS`);
