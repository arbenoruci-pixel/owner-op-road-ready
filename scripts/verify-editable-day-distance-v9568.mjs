// v95.68 verifier: Form tab Distance is editable day-level miles and does not rewrite driving events.
// Run: node scripts/verify-editable-day-distance-v9568.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
function ok(name, fn) {
  fn();
  checks += 1;
  console.log(`PASS ${name}`);
}
function read(path) { return readFileSync(new URL(path, import.meta.url), 'utf8'); }

const dayLog = read('../source/src/modules/logbook/DayLogScreen.jsx');
const app = read('../source/src/app/App.jsx');
const dot = read('../source/src/core/dot/dotOfficerCheckEngine.js');
const styles = read('../source/src/styles.css');
const version = read('../source/src/core/update/appUpdate.js');
const appVersion = read('../public/app-version.json');

ok('Form summary reads day-level manualMilesByDay first', () => {
  assert.ok(dayLog.includes('state.manualMilesByDay?.[state.activeDay]'), 'Form must read manualMilesByDay for active day');
  assert.ok(dayLog.includes('distanceRaw'), 'Form must expose raw distance for prompt default');
});

ok('Distance field is editable from Form tab', () => {
  assert.ok(dayLog.includes('function editDistance()'), 'MiniFormPanel must include editDistance');
  assert.ok(dayLog.includes("window.prompt('Total driving miles for this log day'"), 'Distance edit must prompt for day miles');
  assert.ok(dayLog.includes('onSaveDayDistance?.(miles)'), 'Distance edit must save through day distance handler');
  assert.ok(dayLog.includes('road-form-split-action editable'), 'Distance half-card must be a tappable control');
});

ok('App saves day distance without updating driving event times', () => {
  assert.ok(app.includes('function saveDayDistance'), 'App must include saveDayDistance');
  assert.ok(app.includes('manualMilesByDay[day] = Number(value.toFixed(2))'), 'App must store day-level total miles');
  assert.ok(app.includes('markDayRecert({ ...s, manualMilesByDay }, day)'), 'Distance changes should mark signed days recert');
  const fn = app.slice(app.indexOf('function saveDayDistance'), app.indexOf('function startDrivingFromMotion'));
  assert.ok(!fn.includes('eventsByDay'), 'saveDayDistance must not rewrite eventsByDay');
  assert.ok(!fn.includes('updateEvent'), 'saveDayDistance must not call updateEvent');
});

ok('DOT check accepts day-level miles', () => {
  assert.ok(dot.includes('state.manualMilesByDay?.[day]'), 'DOT form issues must read day-level miles');
  assert.ok(dot.includes('const manualMilesTotal = dayMilesTotal || eventMilesTotal'), 'DOT must accept day-level or event-level miles');
});

ok('Styles show editable distance affordance', () => {
  assert.ok(styles.includes('v95.68 editable day distance field'), 'v95.68 styles marker exists');
  assert.ok(styles.includes('road-form-split-action.editable::after'), 'Editable distance shows chevron');
});

ok('Version is v95.68 or newer', () => {
  assert.ok(/95\.(6[8-9]|[7-9][0-9])\.0/.test(version), 'CURRENT_APP_VERSION must be 95.68.0 or newer');
  assert.ok(/95\.(6[8-9]|[7-9][0-9])\.0/.test(appVersion), 'app-version must be 95.68.0 or newer');
});

console.log(`verify-editable-day-distance-v9568: ${checks} checks passed`);
