import assert from 'node:assert/strict';
import {
  applyLiveStatusTransition,
  safeInsertRolloverDriving,
} from '../source/src/core/timeline/liveDrivingSafety.js';

const base = [
  { id:'d1', status:'D', startMin:0, endMin:80, city:'Youngstown', state:'OH', note:'Driving' },
  { id:'sb1', status:'SB', startMin:80, endMin:680, city:'Cheshire', state:'CT', note:'Sleeper Berth' },
  { id:'on1', status:'ON', startMin:680, endMin:700, city:'Cheshire', state:'CT', note:'On Duty' },
  { id:'d2', status:'D', startMin:700, endMin:756, city:'Cheshire', state:'CT', note:'Driving started' },
  { id:'on2', status:'ON', startMin:756, endMin:845, city:'East Hartford', state:'CT', note:'Pickup / Loading' },
];

const started = applyLiveStatusTransition(base, {
  id:'live_drive', status:'D', startMin:845, endMin:846,
  city:'East Hartford', state:'CT', note:'Driving started', source:'live_status',
});

assert.equal(started.length, 6, 'starting driving must append one new status row');
for (const original of base) {
  const saved = started.find(event => event.id === original.id);
  assert(saved, `historical event ${original.id} must remain`);
  assert.equal(saved.status, original.status, `${original.id} status changed`);
  assert.equal(saved.startMin, original.startMin, `${original.id} start changed`);
}

const stopped = applyLiveStatusTransition(started, {
  id:'live_on', status:'ON', startMin:884, endMin:885,
  city:'East Hartford', state:'CT', note:'Stopped / On Duty', source:'live_status',
});

assert.equal(stopped.find(event => event.id === 'live_drive')?.endMin, 884, 'driving tail must close at stop time');
for (const original of base) {
  const saved = stopped.find(event => event.id === original.id);
  assert(saved, `historical event ${original.id} disappeared after stop`);
  assert.equal(saved.status, original.status, `${original.id} status changed after stop`);
  assert.equal(saved.startMin, original.startMin, `${original.id} start changed after stop`);
}

const broadRollover = {
  id:'gps_drive_2026-07-10_bad', status:'D', startMin:0, endMin:884,
  city:'East Hartford', state:'CT', note:'Driving', source:'gps_drive_rollover',
};
const guarded = safeInsertRolloverDriving(base, broadRollover);
assert.equal(guarded.length, base.length, 'rollover must not add over an already-covered day');
assert.deepEqual(guarded.map(e => [e.id,e.status,e.startMin,e.endMin]), base.map(e => [e.id,e.status,e.startMin,e.endMin]), 'rollover changed existing events');

console.log('verify-live-driving-history-guard-v9597: passed');
