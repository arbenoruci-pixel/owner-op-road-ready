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
import { pointFromLogLocation, estimatedRoadMiles, estimateMilesByStateBetween, parseMilesByState, sumMilesByState } from '../source/src/core/gps/locationService.js';

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


// 9) Manual miles estimate: null/blank coordinates must not become 0,0.
ok('manual miles: null coordinates fall back to log city points', () => {
  const origin = pointFromLogLocation({ city:'Willowbrook', state:'IL', lat:null, lng:null });
  const destination = pointFromLogLocation({ city:'Indianapolis', state:'IN', lat:null, lng:null });
  const miles = estimatedRoadMiles(origin, destination);
  assert.equal(origin.source, 'log-location');
  assert.equal(destination.source, 'log-location');
  assert.ok(miles > 120 && miles < 260, `expected Midwest estimate, got ${miles}`);
});


// 10) Manual miles: DOT asks for total miles only, not state breakdown.
ok('manual miles: DOT asks for total miles only', () => {
  const daySrc = readFileSync(new URL('../source/src/modules/logbook/DayLogScreen.jsx', import.meta.url), 'utf8');
  const dotSrc = readFileSync(new URL('../source/src/core/dot/dotOfficerCheckEngine.js', import.meta.url), 'utf8');
  assert.ok(dotSrc.includes('Driving miles missing'), 'DOT missing miles issue not present');
  assert.ok(daySrc.includes('Enter total miles for this driving'), 'total miles prompt missing');
  assert.ok(daySrc.includes('[62, 65, 68]'), '62/65/68 speed guide missing');
  assert.ok(daySrc.includes('speedMilesOptions'), 'speed miles helper missing');
  assert.ok(!daySrc.includes('Break miles by state'), 'state-breakdown prompt should not be present');
});

// 11) Form route/shipping: route legs should be the source of shipping docs and not leak event notes.
ok('form: route legs do not leak stale notes or overwrite shipping docs', () => {
  const src = readFileSync(new URL('../source/src/modules/logbook/DayLogScreen.jsx', import.meta.url), 'utf8');
  assert.ok(src.includes('const shippingDocs = (routeLegs.length ? legDocs'), 'route docs should drive shipping docs when legs exist');
  assert.ok(src.includes('const notes = safeValue(load.notes || load.note || state.formNotes'), 'form notes should not be pulled from event notes');
  assert.ok(src.includes('onClick={() => editRouteLeg(leg)}'), 'route leg rows should open edit flow');
  assert.ok(src.includes('onSaveLoad?.({ routeLegsByDay });'), 'adding a route leg should not overwrite day-level loadInfo fields');
});

// 12) Form route legs must have an explicit delete action.
ok('form: route legs can be deleted', () => {
  const src = readFileSync(new URL('../source/src/modules/logbook/DayLogScreen.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../source/src/styles.css', import.meta.url), 'utf8');
  assert.ok(src.includes('function deleteRouteLeg'), 'deleteRouteLeg function missing');
  assert.ok(src.includes('route-leg-delete'), 'delete button class missing');
  assert.ok(src.includes("filter(item => item.id !== leg.id)"), 'route leg delete filter missing');
  assert.ok(css.includes('v95.28 route leg delete action'), 'route leg delete styles missing');
});

// 13) Fix wizard must show and open the problem day.
ok('fix wizard: issue day is visible and openable', () => {
  const daySrc = readFileSync(new URL('../source/src/modules/logbook/DayLogScreen.jsx', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../source/src/app/App.jsx', import.meta.url), 'utf8');
  assert.ok(daySrc.includes('Problem day: {dayDisplayLabel(step.day || day)}'), 'wizard problem-day label missing');
  assert.ok(daySrc.includes('openStepDay'), 'wizard open-day handler missing');
  assert.ok(daySrc.includes('issue-day-link'), 'issue day link missing');
  assert.ok(appSrc.includes('const tab = [\'log\',\'form\',\'sign\',\'inspection\'].includes(payload.tab)'), 'OPEN_DAY tab routing missing');
});

// 14) DOT/signing must catch missing ON DUTY pre-trip before driving and offer a 15m fix.
ok('pretrip: missing ON DUTY pre-trip before driving is detected and fixable', () => {
  const signingSrc = readFileSync(new URL('../source/src/modules/logbook/signing.js', import.meta.url), 'utf8');
  const dotSrc = readFileSync(new URL('../source/src/core/dot/dotOfficerCheckEngine.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../source/src/app/App.jsx', import.meta.url), 'utf8');
  assert.ok(signingSrc.includes('missing_pretrip_event'), 'signing pre-trip issue missing');
  assert.ok(dotSrc.includes('ADD_PRETRIP_BEFORE_DRIVING'), 'DOT pre-trip fix action missing');
  assert.ok(appSrc.includes('function addPreTripBeforeDriving'), 'app pre-trip fix function missing');
  assert.ok(appSrc.includes('endMin - 15'), '15 minute pre-trip insertion missing');
  assert.ok(appSrc.includes('inspectionFromPreTripEvent(day, preTripEvent'), 'pre-trip insertion should create/link inspection');
});

// 15) Smart DOT: detect location continuity and unsigned previous day.
ok('smart dot: location continuity and unsigned previous day are detected', () => {
  const signingSrc = readFileSync(new URL('../source/src/modules/logbook/signing.js', import.meta.url), 'utf8');
  const dotSrc = readFileSync(new URL('../source/src/core/dot/dotOfficerCheckEngine.js', import.meta.url), 'utf8');
  assert.ok(signingSrc.includes('locationContinuityIssues'), 'signing location continuity check missing');
  assert.ok(dotSrc.includes('buildLocationContinuityIssues'), 'DOT location continuity check missing');
  assert.ok(signingSrc.includes('previous_unsigned_'), 'previous unsigned DOT package issue missing');
  assert.ok(dotSrc.includes('Inspection link review'), 'inspection link review missing');
  assert.ok(dotSrc.includes('Pre-trip timing needs review'), 'pre-trip timing review missing');
});

// 16) Location-continuity issues must offer a direct location fix.
ok('location continuity: issue offers direct location fix suggestions', () => {
  const signingSrc = readFileSync(new URL('../source/src/modules/logbook/signing.js', import.meta.url), 'utf8');
  const dotSrc = readFileSync(new URL('../source/src/core/dot/dotOfficerCheckEngine.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../source/src/app/App.jsx', import.meta.url), 'utf8');
  assert.ok(signingSrc.includes('FIX_LOCATION_CONTINUITY'), 'signing action missing');
  assert.ok(dotSrc.includes('Fix location'), 'DOT fix label missing');
  assert.ok(appSrc.includes('function fixLocationContinuity'), 'app fixLocationContinuity function missing');
  assert.ok(appSrc.includes('Recommended: set current event'), 'current-to-previous recommended fix missing');
  assert.ok(appSrc.includes('Recommended: set earlier connected event(s)'), 'previous-chain recommended fix missing');
});

// 17) Fix Wizard should visually focus location-jump problems and show Fix it.
ok('fix wizard: location jump has focused visual fix UI', () => {
  const daySrc = readFileSync(new URL('../source/src/modules/logbook/DayLogScreen.jsx', import.meta.url), 'utf8');
  const signSrc = readFileSync(new URL('../source/src/modules/logbook/signing.js', import.meta.url), 'utf8');
  const cssSrc = readFileSync(new URL('../source/src/styles.css', import.meta.url), 'utf8');
  assert.ok(daySrc.includes('function LocationContinuityFocus'), 'LocationContinuityFocus component missing');
  assert.ok(daySrc.includes('Reference location') || daySrc.includes('Current event'), 'current/reference event emphasis missing');
  assert.ok(daySrc.includes("step.action === 'FIX_LOCATION_CONTINUITY' ? 'Fix it'"), 'Fix it button label missing');
  assert.ok(signSrc.includes("label:'Fix it'"), 'Fix it action label missing');
  assert.ok(cssSrc.includes('wizard-location-compare .bad'), 'highlight style missing');
});

// 18) Location-continuity fix should recommend patching the earlier chain when current/pre-trip is the reference.
ok('location continuity: recommended fix can patch previous connected chain', () => {
  const signingSrc = readFileSync(new URL('../source/src/modules/logbook/signing.js', import.meta.url), 'utf8');
  const daySrc = readFileSync(new URL('../source/src/modules/logbook/DayLogScreen.jsx', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../source/src/app/App.jsx', import.meta.url), 'utf8');
  assert.ok(signingSrc.includes('preferPreviousToCurrent'), 'issue metadata for preferred direction missing');
  assert.ok(signingSrc.includes('location_jump_pretrip_drive'), 'pretrip-driving location mismatch issue missing');
  assert.ok(daySrc.includes('Likely wrong'), 'focused UI should highlight the likely wrong side');
  assert.ok(appSrc.includes('fixChainToCurrent'), 'chain fix flag missing in app');
  assert.ok(appSrc.includes('set earlier connected event(s)'), 'recommended chain-fix prompt missing');
});

// 19) Clean edit flow: graph/event taps open edit without selected Move/Edit/Void bar.
ok('clean edit flow: no selected action bar in log screen', () => {
  const daySrc = readFileSync(new URL('../source/src/modules/logbook/DayLogScreen.jsx', import.meta.url), 'utf8');
  const eventListSrc = readFileSync(new URL('../source/src/modules/logbook/EventList.jsx', import.meta.url), 'utf8');
  const cssSrc = readFileSync(new URL('../source/src/styles.css', import.meta.url), 'utf8');
  assert.ok(!daySrc.includes('SelectedEventBar'), 'DayLogScreen should not render selected event bar');
  assert.ok(daySrc.includes('handleGraphEventTap'), 'graph tap edit handler missing');
  assert.ok(daySrc.includes('clean-edit-flow-rail'), 'clean action rail missing');
  assert.ok(!daySrc.includes("state.selectMode ? 'Done' : 'Move'"), 'main Move button should be removed');
  assert.ok(eventListSrc.includes('onOpenEdit(event.id)'), 'event row tap should open edit');
  assert.ok(cssSrc.includes('v95.35 clean event edit flow'), 'clean edit CSS missing');
});

console.log(`verify-deep-scan-v952: ${checks} checks passed`);
