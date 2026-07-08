import assert from 'node:assert/strict';
import { loadRealBackupState } from './fixtures/real-backup-v9574b.mjs';
import { drivingEventSignatureByDay, normalizeRoadReadyState } from '../source/src/core/routes/routeNormalization.js';

const beforeState = loadRealBackupState();
const before = drivingEventSignatureByDay(beforeState);
const afterState = normalizeRoadReadyState(beforeState);
const after = drivingEventSignatureByDay(afterState);
assert.deepEqual(after, before, 'normalization must not change any DRIVING event id/status/start/end');
const jul06Driving = (after['2026-07-06'] || []).map(({ status, startMin, endMin }) => ({ status, startMin, endMin }));
const jul07Driving = (after['2026-07-07'] || []).map(({ status, startMin, endMin }) => ({ status, startMin, endMin }));
assert.deepEqual(jul06Driving, [{ status:'D', startMin:48, endMin:252 }], 'July 6 driving time remains 00:48–04:12');
assert.deepEqual(jul07Driving, [{ status:'D', startMin:26, endMin:215 }], 'July 7 driving time remains 00:26–03:35');

for (const [day, events] of Object.entries(afterState.eventsByDay || {})) {
  for (const event of events || []) {
    if (event.status !== 'D') continue;
    const original = beforeState.eventsByDay[day].find(row => row.id === event.id);
    assert.ok(original, `${event.id} exists in original backup fixture`);
    assert.equal(event.startMin, original.startMin, `${event.id} startMin unchanged`);
    assert.equal(event.endMin, original.endMin, `${event.id} endMin unchanged`);
    assert.equal(event.status, original.status, `${event.id} status unchanged`);
  }
}

console.log('verify-real-backup-driving-unchanged-v9574b passed');
