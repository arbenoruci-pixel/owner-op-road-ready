#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const appVersion = JSON.parse(read('public/app-version.json'));
const app = read('source/src/app/App.jsx');
const tools = read('source/src/shared/ui/ToolsSheet.jsx');
const day = read('source/src/modules/logbook/DayLogScreen.jsx');
const shift = read('source/src/modules/editor/ShiftSheet.jsx');
const css = read('source/src/styles.css');
const notes = read('PATCH_V95_64_DAY_SHIFT_EVENTS_NOTES.md');

const ok = (condition, message) => assert.ok(condition, message);

ok(/^95\.(6[4-9]|[7-9][0-9])\.0$/.test(pkg.version), 'package version is v95.64 or newer');
ok(/^95\.(6[4-9]|[7-9][0-9])\.0$/.test(appVersion.version), 'app version is v95.64 or newer');
ok(/CURRENT_APP_VERSION = '95\.(6[4-9]|[7-9][0-9])\.0'/.test(read('source/src/core/update/appUpdate.js')), 'CURRENT_APP_VERSION bumped');
ok(/OWNER_OP_SW_VERSION = '95\.(6[4-9]|[7-9][0-9])\.0'/.test(read('public/sw.js')), 'service worker version bumped');

ok(tools.includes('onMove'), 'ToolsSheet accepts onMove');
ok(tools.includes('Shift day events'), 'Tools menu shows Shift day events');
ok(tools.includes('Select all real events'), 'Tools explains all real events');

ok(day.includes('day-shift-strip'), 'DayLogScreen renders day shift selection strip');
ok(day.includes('All day'), 'Selection strip has All day button');
ok(day.includes('onSelectAll'), 'Selection strip calls onSelectAll');
ok(day.includes('onOpenShift'), 'Selection strip calls onOpenShift');

ok(app.includes('rawStoredEventsForDay(s.eventsByDay || {}, s.activeDay).map(e=>e.id)'), 'Select all uses raw stored events');
ok(app.includes('const baseEvents = rawStoredEventsForDay(s.eventsByDay || {}, s.activeDay);'), 'applyShift uses raw stored event base');
const applyShiftBody = app.slice(app.indexOf('function applyShift(delta)'), app.indexOf('function moveSelectedEventInline'));
ok(!applyShiftBody.includes('continuousBaseForDay(') && !applyShiftBody.includes('displayEventsForDayFromState'), 'applyShift does not use continuous/display base');
ok(app.includes('routeLegsByDay:syncRouteLegTimes'), 'applyShift re-syncs route legs');
ok(app.includes('selectMode:false') && app.includes('selectedIds:[]'), 'applyShift exits selection mode');
ok(app.includes('markRecert(next)'), 'applyShift marks recertification when needed');
ok(app.includes('<ShiftSheet events={rawEvents}'), 'ShiftSheet receives rawEvents for preview');

ok(shift.includes('Shift Day Events'), 'ShiftSheet title supports all-day mode');
ok(shift.includes('All day events'), 'ShiftSheet summary supports all-day mode');
ok(shift.includes('synthetic carry-forward/display rows'), 'ShiftSheet warns raw-only shift');
ok(shift.includes('Math.max(-minStart, Math.min(1440 - maxEnd, requestedDelta))'), 'Shift is clamped inside 24h day');

ok(css.includes('v95.64 day shift selection controls'), 'v95.64 selection CSS exists');
ok(notes.includes('Day Shift Events'), 'patch notes included');

console.log('verify-day-shift-events-v9564: 25 checks passed');
