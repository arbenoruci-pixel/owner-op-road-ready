import assert from 'node:assert/strict';
import { applyLogbookEditorInsert, previewLogbookInsertOverride, projectLogbookEvents } from '../source/src/modules/logbook/eventEditingV110.js';

const day = '2026-09-09', at = new Date('2026-09-10T02:40:00Z');
const row = (id, status, startMin, endMin, extra = {}) => ({ id, status, startMin, endMin, source: 'manual', city: 'Example City', state: 'RI', ...extra });
function fixture(status = 'SB') {
  return {
    activeDay: day, homeTerminalTimeZone: 'America/New_York', currentStatus: status,
    currentReason: 'Existing activity', currentLocation: { city: 'Example City', state: 'RI' },
    eventsByDay: { [day]: [row('earlier', 'D', 0, 1320), row('live', status, 1320, 1321, { source: 'live_status', note: 'Keep note', lat: 41, lng: -71 })] },
    signatureByDay: { '2026-09-08': { signed: true } },
    routeLegsByDay: { [day]: [{ id: 'existing-route', pickupEventId: 'live' }] },
    loadInfo: { loadNo: 'TEST-LOAD' },
  };
}
const command = (state, startMin, endMin) => ({ day, event: row('inserted', 'ON', startMin, endMin, { note: 'Fuel', reasons: ['Fuel'] }), expectedRows: structuredClone(state.eventsByDay[day]) });
const ranges = events => events.map(({ id, status, startMin, endMin }) => [id, status, startMin, endMin]);
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS — ' + name); }

for (const status of ['OFF', 'SB', 'ON']) for (const [start, end] of [[1330, 1340], [1359, 1360], [1320, 1360], [1310, 1340]]) {
  test(`${status}: Insert ${start}–${end} splits elapsed time and preserves live continuation`, () => {
    const state = fixture(status), original = structuredClone(state), cmd = command(state, start, end);
    const preview = previewLogbookInsertOverride(state, cmd, at);
    assert.equal(preview.ok, true, preview.error);
    assert.deepEqual(state, original, 'Preview is read-only');
    const saved = applyLogbookEditorInsert(state, cmd, at);
    assert.equal(saved.ok, true, saved.error);
    assert.deepEqual(saved.events, preview.events, 'Save uses the same interval as preview');
    assert.equal(saved.events.find(event => event.id === 'live').startMin, end);
    assert.equal(saved.events.find(event => event.id === 'live').source, 'live_status');
    assert.equal(saved.events.find(event => event.id === 'live').note, 'Keep note');
    assert.equal(new Set(saved.events.map(event => event.id)).size, saved.events.length);
    for (const key of ['currentStatus', 'currentReason', 'currentLocation', 'manualDrivingSession', 'gpsTrip', 'signatureByDay', 'routeLegsByDay', 'loadInfo']) assert.deepEqual(saved.state[key], original[key], key);
    const projected = projectLogbookEvents(saved.state, day, at);
    assert.equal(projected.at(-1).id, 'live');
    assert.equal(projected.at(-1).isLive, true);
    assert.equal(projected.at(-1).endMin, 1360);
    for (let index = 1; index < projected.length; index++) assert.equal(projected[index - 1].endMin, projected[index].startMin, 'No gap or overlap');
    const reopened = JSON.parse(JSON.stringify(saved.state));
    assert.equal(projectLogbookEvents(reopened, day, new Date('2026-09-10T02:45:00Z')).at(-1).endMin, 1365);
    assert.deepEqual(saved.state.logbookEditHistoryByDay[day][0].beforeEvents, original.eventsByDay[day]);
    assert.deepEqual(state, original);
  });
}
test('Future interval is rejected without changing the live status', () => {
  const state = fixture(), original = structuredClone(state);
  const result = applyLogbookEditorInsert(state, command(state, 1359, 1361), at);
  assert.equal(result.ok, false); assert.match(result.error, /at or before Now/); assert.deepEqual(state, original);
});
test('A second Insert still works after an Insert ending exactly at Now', () => {
  const first = applyLogbookEditorInsert(fixture(), command(fixture(), 1359, 1360), at).state;
  const cmd = command(first, 1361, 1362); cmd.event.id = 'second';
  const second = applyLogbookEditorInsert(first, cmd, new Date('2026-09-10T02:45:00Z'));
  assert.equal(second.ok, true, second.error); assert.equal(second.events.find(event => event.id === 'live').startMin, 1362);
});
test('Stale day and duplicate IDs remain rejected', () => {
  const state = fixture(), cmd = command(state, 1359, 1360);
  state.eventsByDay[day][0].note = 'Changed elsewhere';
  assert.equal(applyLogbookEditorInsert(state, cmd, at).ok, false);
  const duplicate = command(state, 1359, 1360); duplicate.event.id = 'live';
  assert.equal(applyLogbookEditorInsert(state, duplicate, at).ok, false);
});
test('Live Driving and automatic Driving keep their existing protection', () => {
  for (const source of ['live_status', 'gps_drive', 'eld']) {
    const state = fixture('D'); state.eventsByDay[day][1].source = source;
    state.manualDrivingSession = { active: true, eventId: 'live', startDay: day };
    assert.equal(applyLogbookEditorInsert(state, command(state, 1359, 1360), at).ok, false);
  }
  const state = fixture(); state.eventsByDay[day][0].source = 'eld';
  assert.equal(applyLogbookEditorInsert(state, command(state, 1310, 1340), at).ok, false);
});
test('Elapsed fragments do not double-count entered mileage', () => {
  for (const end of [1340, 1360]) {
    const state = fixture('ON'); state.eventsByDay[day][1].manualMiles = 12;
    const result = applyLogbookEditorInsert(state, command(state, 1330, end), at);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.events.reduce((total, event) => total + Number(event.manualMiles || 0), 0), 12);
  }
});
test('Closed historical day keeps ordinary manual Insert behavior', () => {
  const state = fixture(); state.activeDay = '2026-09-08'; state.eventsByDay[state.activeDay] = [row('off', 'OFF', 0, 1440)];
  const result = applyLogbookEditorInsert(state, { day: state.activeDay, event: row('new', 'ON', 600, 660) }, at);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(ranges(result.events).map(event => event.slice(1)), [['OFF', 0, 600], ['ON', 600, 660], ['OFF', 660, 1440]]);
});
test('Voided and display-only records remain untouched, including a reused live ID', () => {
  const state = fixture();
  const voided = row('live', 'ON', 10, 20, { voided: true, note: 'Audit record' });
  const display = row('display', 'OFF', 0, 1320, { displayOnly: true });
  state.eventsByDay[day].unshift(voided, display, null);
  const result = applyLogbookEditorInsert(state, command(state, 1359, 1360), at);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.events.filter(event => !event || event.voided || event.displayOnly), [voided, display, null]);
  const live = projectLogbookEvents(result.state, day, at).find(event => event.isLive);
  assert.equal(live.id, 'live'); assert.equal(live.status, 'SB'); assert.equal(live.startMin, 1360);
  state.eventsByDay[day].find(event => event?.id === 'live' && !event.voided).manualMiles = 12;
  const covered = applyLogbookEditorInsert(state, command(state, 1320, 1360), at);
  assert.equal(covered.ok, true, covered.error);
  assert.equal(covered.events.find(event => event?.id === 'live' && !event.voided).manualMiles, 12);
});
console.log(`${passed} elapsed Insert regression groups passed`);
