import assert from 'node:assert/strict';
import { loadRealBackupState } from './fixtures/real-backup-v9574b.mjs';
import { normalizeRoadReadyState } from '../source/src/core/routes/routeNormalization.js';

const state = normalizeRoadReadyState(loadRealBackupState());
const legs = state.routeLegsByDay['2026-07-07'] || [];
assert.ok(legs.length >= 1, 'July 7 keeps the empty/reposition movement leg');
assert.ok(legs.some(leg => /empty|reposition/i.test(String(leg.kind || leg.routeIntent || ''))), 'July 7 move is normalized to empty/reposition');
assert.ok(legs.every(leg => leg.loadNo !== '113NRH53Z' && leg.shippingDocs !== '113NRH53Z'), 'July 7 route legs do not carry 113NRH53Z as current load docs');
assert.ok(legs.every(leg => leg.kind !== 'loaded'), 'July 7 legacy equipment move is not normalized as loaded');
assert.ok(!legs.some(leg => leg.id === 'leg_hook_live_1783438869426' && String(leg.status || '').toLowerCase() === 'open'), 'Drop Off leg does not remain as stale open loaded route leg');

const hookEvent = state.eventsByDay['2026-07-07'].find(event => event.id === 'live_1783397778992');
const dropOffEvent = state.eventsByDay['2026-07-07'].find(event => event.id === 'live_1783438869426');
assert.equal(hookEvent.shippingDocs, '', 'July 7 hook/reposition event current shipping docs are cleared');
assert.equal(hookEvent.loadNo, '', 'July 7 hook/reposition event current load number is cleared');
assert.equal(dropOffEvent.shippingDocs, '', 'July 7 drop-off event current shipping docs are cleared');
assert.equal(dropOffEvent.loadNo, '', 'July 7 drop-off event current load number is cleared');
assert.equal(hookEvent.staleCarryoverLoadNo, '113NRH53Z', 'cleared hook event keeps stale carryover audit metadata only');

console.log('verify-real-backup-jul07-empty-reposition-no-113NRH53Z-carryover-v9574b passed');
