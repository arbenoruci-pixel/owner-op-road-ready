import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
register(new URL('./test-jsx-loader.mjs', import.meta.url));
const { default: Editor, buildDailyMileageSegments: build, allocateMiles } = await import('../source/src/modules/logbook/MileageSegmentEditor.jsx');
const row = (id, status, startMin, endMin, city, state, extra = {}) => ({ id, status, startMin, endMin, city, state, ...extra });
// Synthetic reproduction: a copied previous-day origin, then a recorded rest stop.
const events = [
  row('carry', 'D', 0, 59, 'Princeton', 'IL', { lat:41.396, lng:-89.462, crossMidnightContinuation:true, crossMidnightFromDay:'2026-10-11', source:'manual_drive_midnight_continuation' }),
  row('sleep', 'SB', 59, 887, 'Springfield', 'NE', { lat:41.142, lng:-96.146 }),
  row('pretrip', 'ON', 887, 917, 'Springfield', 'NE'),
  row('drive-out', 'D', 917, 1197, 'Springfield', 'NE'),
  row('break', 'OFF', 1197, 1227, 'Rochester', 'IA', { lat:41.644, lng:-91.152 }),
  row('drive-on', 'D', 1227, 1440, 'Rochester', 'IA', { lat:41.644, lng:-91.152 }),
];
const original = structuredClone(events);
const segments = build(events);
assert.equal(segments.length, 3, 'Each recorded stop ends its mileage segment');
assert.deepEqual(segments.map(s => [s.startMin, s.endMin, s.drivingMinutes]), [[0,59,59],[917,1197,280],[1227,1440,213]]);
assert.deepEqual(segments.map(s => s.drivingEvents.map(e => e.id)), [['carry'],['drive-out'],['drive-on']]);
assert.equal(segments[0].from.label, 'Continued from previous day');
assert.equal(segments[0].miles, 60.97, '59 minutes must not inherit the full previous-day route');
assert.equal(segments[0].confidence, 'Low');
assert.match(segments[0].estimateNote, /midnight location/i);
assert.equal(segments[1].to.label, 'Rochester, IA');
assert.equal(segments[2].from.label, 'Rochester, IA');
assert.equal(segments[2].to.label, 'Continues');
assert.equal(segments[2].miles, 220.1);
assert.deepEqual(events, original, 'Building the review must not change the log');

for (const status of ['OFF', 'SB', 'ON']) {
  const stopped = build([row('a','D',0,60,'Chicago','IL'), row('stop',status,60,90,'Elgin','IL'), row('b','D',90,150,'Elgin','IL')]);
  assert.equal(stopped.length, 2, `${status} stop must remain visible`);
  assert.equal(stopped[0].miles, 52);
  assert.equal(stopped[1].miles, 62);
}
const adjacent = build([row('a','D',0,30,'Chicago','IL'), row('b','D',30,60,'Chicago','IL')]);
assert.equal(adjacent.length, 1);
assert.deepEqual(allocateMiles(adjacent[0], 62.01), [{eventId:'a',miles:31},{eventId:'b',miles:31.01}]);

// Reject route suggestions that cannot fit the recorded interval, whether their
// source is a hard-coded route, load route, or copied endpoint coordinates.
const impossible = [
  [row('a','D',0,10,'Elgin','IL'), row('stop','OFF',10,60,'Woodhaven','MI')],
  [row('a','D',0,10,'Origin','IL'), row('stop','OFF',10,60,'Destination','NE')],
  events.slice(0,2).map(e => ({...e, crossMidnightContinuation:false, crossMidnightFromDay:undefined, source:'manual'})),
];
for (const input of impossible) {
  const route = [{fromCity:'Origin',fromState:'IL',toCity:'Destination',toState:'NE',miles:400}];
  const [s] = build(input, route);
  assert.equal(s.source, 'driving-time guide');
  assert.equal(s.confidence, 'Low');
  assert.match(s.estimateNote, /recorded driving time/i);
  assert.equal(s.miles, Number((s.drivingMinutes / 60 * 62).toFixed(2)));
}
for (const extra of [{crossMidnightContinuation:true}, {crossMidnightFromDay:'2026-10-11'}, {source:'manual_drive_midnight_continuation'}]) {
  const [s] = build([row('a','D',0,60,'Chicago','IL',extra), row('stop','OFF',60,90,'Elgin','IL')]);
  assert.equal(s.miles, 62, 'A matching known route must not bypass the day boundary');
}
const reviewed = events.map(e => e.status === 'D' ? {...e, manualMiles:50} : e);
const html = renderToStaticMarkup(React.createElement(Editor, {open:true, events:reviewed}));
assert.equal((html.match(/value="50"/g) || []).length, 3, 'Driver-reviewed values remain authoritative');
assert.match(html, /midnight location/i);
assert.doesNotMatch(html, /Princeton|439\.53|948\.96/);
assert.match(html, /Miles for segment 3/);
assert.deepEqual(events, original);
console.log('PASS — day-boundary mileage: midnight carry, every stop, plausible estimates, exact allocations, saved values and no log mutation');
