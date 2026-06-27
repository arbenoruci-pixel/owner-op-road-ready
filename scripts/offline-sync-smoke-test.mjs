import assert from 'node:assert/strict';
import { buildMutation, normalizeDutyEventForSync, retryDelayMs } from '../lib/sync/payload.js';

const eventChainId = '11111111-1111-4111-8111-111111111111';
const clientEventId = '22222222-2222-4222-8222-222222222222';

const payload = normalizeDutyEventForSync({
  day: '2026-06-21',
  action: 'create',
  eventChainId,
  clientEventId,
  event: {
    id: 'ev_test_1',
    status: 'D',
    startMin: 480,
    endMin: 540,
    city: 'Chicago',
    state: 'IL',
    note: 'Driving',
    source: 'gps_drive'
  }
});

assert.equal(payload.client_event_id, clientEventId);
assert.equal(payload.event_chain_id, eventChainId);
assert.equal(payload.log_date, '2026-06-21');
assert.equal(payload.status, 'D');
assert.equal(payload.source, 'gps_assisted');
assert.equal(payload.start_min, 480);
assert.equal(payload.end_min, 540);

const yardPayload = normalizeDutyEventForSync({
  day: '2026-06-21',
  action: 'edit',
  eventChainId,
  event: {
    id: 'ev_yard',
    status: 'D',
    startMin: 600,
    endMin: 610,
    note: 'Yard Move'
  }
});
assert.equal(yardPayload.special_mode, 'yard_move');
assert.equal(yardPayload.action, 'edit');

const mutation = buildMutation({
  entity: 'duty_event',
  operation: 'create',
  entityClientId: payload.client_event_id,
  payload
});

assert.match(mutation.client_mutation_id, /^[0-9a-f-]{36}$/i);
assert.equal(mutation.entity, 'duty_event');
assert.equal(mutation.status, 'pending');
assert.equal(retryDelayMs(0), 0);
assert.equal(retryDelayMs(1), 10_000);
assert.equal(retryDelayMs(5), 900_000);
assert.equal(retryDelayMs(99), 900_000);

console.log('offline-sync-smoke-test: passed');
