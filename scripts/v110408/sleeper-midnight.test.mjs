import assert from 'node:assert/strict';
import { projectLogbookEvents, logbookClock } from '../../source/src/modules/logbook/eventEditingV110.js';
import { displayEventsForDayFromState } from '../../source/src/core/timeline/displayTimeline.js';
import { dutyViewEvents } from '../../source/src/modules/logbook/dutyViewV110212.js';
import { readArchiveLogbookDay } from '../../source/src/modules/logbook/archiveDayV1103.js';
import { rawCoverageIssues } from '../../source/src/core/compliance/rawRodsChecks.js';
import { addTeamDriver, switchTeamDriver } from '../../source/src/core/team/teamLogbook.js';
import { buildFullBackupPayloadV105 } from '../../source/src/modules/backup/fullBackupV105.js';

const day = '2026-09-25', today = '2026-09-26';
const at = new Date('2026-09-26T12:15:00Z'); // 07:15 in the home terminal, Chicago.
const row = (id, status, startMin, endMin, extra = {}) => ({
  id, status, startMin, endMin, source:'live_status', city:'Chicago', state:'IL', ...extra,
});
function fixture(kind = 'manual-end', status = 'SB') {
  return {
    activeDay:today, homeTerminalTimeZone:'America/Chicago', currentStatus:'D',
    driverProfile:{name:'Alpha'},
    eventsByDay:{
      [day]:[
        row('off', 'OFF', 0, 600),
        row('drive', 'D', 600, kind === 'gap' ? 1310 : kind === 'overlap' ? 1330 : 1320,
          kind === 'manual-end' ? {paperLogEndV110315:true} : {}),
        row('rest', status, 1320, 1321),
      ],
      [today]:[row('next-drive', 'D', 420, 421)],
    },
    signatureByDay:{[day]:{signed:true, marker:'preserve-signature'}},
    inspectionByDay:{[day]:{complete:true, marker:'preserve-inspection'}},
    formByDay:{[day]:{driverName:'Recorded Alpha'}},
    logbookEditHistoryByDay:{[day]:[{targetId:'drive', marker:'preserve-edit'}]},
  };
}
function visible(state, selectedDay = day, instant = at) {
  const clock = logbookClock(state, instant);
  return dutyViewEvents(
    projectLogbookEvents(state, selectedDay, instant),
    displayEventsForDayFromState(state.eventsByDay, selectedDay, {
      today:clock.day, nowMinute:clock.minute, currentStatus:state.currentStatus,
    }),
    {day:selectedDay, eventsByDay:state.eventsByDay, clock},
  );
}
let passed = 0;
const test = (label, run) => { run(); passed++; console.log('PASS — ' + label); };
for (const kind of ['gap', 'overlap']) {
  for (const status of ['SB', 'OFF', 'ON']) test(`${status} midnight tail preserves an earlier same-status ${kind}`, () => {
    const state = fixture(kind, status), before = structuredClone(state);
    state.eventsByDay[day][1].status = status;
    before.eventsByDay[day][1].status = status;
    const result = visible(state);
    assert.deepEqual(result.slice(0,-1), state.eventsByDay[day].slice(0,-1));
    assert.equal(result.at(-1).id, 'rest');
    assert.equal(result.at(-1).startMin, 1320);
    assert.equal(result.at(-1).endMin, 1440);
    assert.deepEqual(readArchiveLogbookDay(state, day, at), result);
    assert.deepEqual(state, before);
  });
}
for (const kind of ['manual-end', 'gap', 'overlap']) {
  for (const status of ['SB', 'OFF', 'ON']) test(`${status} reaches midnight despite an earlier ${kind}`, () => {
    const state = fixture(kind, status), before = structuredClone(state);
    const result = visible(state);
    assert.equal(result.at(-1).startMin, 1320);
    assert.equal(result.at(-1).endMin, 1440, 'The prior-day live tail must reach midnight');
    assert.deepEqual(result.slice(0, -1), state.eventsByDay[day].slice(0, -1), 'Earlier boundaries stay exact');
    assert.deepEqual(readArchiveLogbookDay(state, day, at), result);
    assert.deepEqual(visible(JSON.parse(JSON.stringify(state))), result);
    const next = visible(state, today);
    assert.deepEqual([next[0].status, next[0].startMin, next[0].endMin], [status, 0, 420]);
    const coverage = rawCoverageIssues(state.eventsByDay, day, {today, nowMinute:435, currentStatus:'D'});
    assert.ok(!coverage.issues.some(issue => issue.code === 'day_end_gap'));
    if (kind !== 'manual-end') assert.ok(coverage.issues.some(issue => issue.code.startsWith(kind === 'gap' ? 'gap_' : 'overlap_')));
    assert.deepEqual(state, before, 'Views must preserve every raw record, signature, Form and edit');
    assert.equal(projectLogbookEvents(state, day, at).at(-1).endMin, 1321, 'Editor retains stored evidence');
  });
}
test('an explicitly ended Sleeper remains ended and cannot carry to the next day', () => {
  const state = fixture();
  state.eventsByDay[day].at(-1).paperLogEndV110315 = true;
  assert.equal(visible(state).at(-1).endMin, 1321);
  assert.equal(visible(state, today).some(event => event.source === 'known_midnight_carry'), false);
});
for (const patch of [{source:'manual'}, {status:'D'}]) test('a bounded or Driving tail is never extended: ' + JSON.stringify(patch), () => {
  const state = fixture();
  Object.assign(state.eventsByDay[day].at(-1), patch);
  assert.equal(visible(state).at(-1).endMin, 1321);
});
test('home-terminal midnight, rather than device UTC midnight, closes the visible tail', () => {
  const state = fixture(); state.currentStatus = 'SB';
  const beforeMidnight = new Date('2026-09-26T04:45:00Z');
  assert.equal(visible(state, day, beforeMidnight).at(-1).endMin, 1425);
  assert.equal(visible(state, day, new Date('2026-09-26T05:00:00Z')).at(-1).endMin, 1440);
});
test('an earlier explicit End still bounds that row before midnight', () => {
  const state = fixture(); state.currentStatus = 'SB';
  const result = visible(state, day, new Date('2026-09-26T04:45:00Z'));
  assert.equal(result[1].endMin, 1320);
  assert.equal(result.at(-1).endMin, 1425);
});
test('a display tail cannot extend a day without a past home-terminal clock', () => {
  const exact = fixture().eventsByDay[day];
  for (const patch of [{}, {id:'other'}, {status:'OFF'}, {startMin:1319}, {endMin:1441}]) {
    const continuous = [...exact.slice(0, -1), {...exact.at(-1), endMin:1440, ...patch}];
    assert.equal(dutyViewEvents(exact, continuous, {day}).at(-1).endMin, 1321);
  }
});
test('a just-started live ON row stays at Now instead of projecting its future sentinel minute', () => {
  const state = {activeDay:today, homeTerminalTimeZone:'America/Chicago', currentStatus:'ON', eventsByDay:{[today]:[
    row('rest', 'SB', 0, 420),
    row('pretrip', 'ON', 420, 435, {note:'Pre-trip inspection'}),
    row('pickup', 'ON', 435, 436, {note:'Pickup / Loading', loadDetailsExplicit:true}),
  ]}};
  const exact = projectLogbookEvents(state, today, at);
  assert.equal(exact.at(-1).isLive, true);
  assert.equal(exact.at(-1).endMin, 435);
  assert.deepEqual(visible(state, today), exact, 'The current-day Now projection retains its zero-minute live row');
});
test('team switching and backup export retain the same original Sleeper evidence', () => {
  const state = fixture(), team = addTeamDriver(state, 'Beta', today);
  const away = switchTeamDriver(team, team.teamDrivers[1].id, today);
  const back = switchTeamDriver(away, team.activeDriverId, today);
  assert.equal(visible(back).at(-1).endMin, 1440);
  assert.deepEqual(back.eventsByDay, state.eventsByDay);
  assert.deepEqual(back.signatureByDay, state.signatureByDay);
  const backup = buildFullBackupPayloadV105(back, {}, {appVersion:'110.4.8'});
  assert.deepEqual(backup.state.eventsByDay[day], state.eventsByDay[day]);
  assert.equal(visible(backup.state).at(-1).endMin, 1440);
});
console.log(`${passed} prior-day live-tail regression groups passed`);
