import assert from 'node:assert/strict';
import { loadRealBackupState } from './fixtures/real-backup-v9574b.mjs';
import { normalizeRoadReadyState } from '../source/src/core/routes/routeNormalization.js';

const state = normalizeRoadReadyState(loadRealBackupState());
const loadInfo = state.loadInfo || {};
assert.equal(state.currentTrailer, 'No equipment', 'current equipment remains No equipment after drop off');
assert.equal(state.equipment?.container || '', '', 'current container is clear');
assert.equal(state.equipment?.chassis || '', '', 'current chassis is clear');
assert.equal(loadInfo.loadNo || '', '', 'loadInfo.loadNo clears after Drop Off/no equipment');
assert.equal(loadInfo.shippingDocs || '', '', 'loadInfo.shippingDocs clears after Drop Off/no equipment');
assert.equal(loadInfo.bol || '', '', 'loadInfo.bol clears stale 113NRH53Z');
assert.equal(loadInfo.po || '', '', 'loadInfo.po clears stale 113NRH53Z');
assert.notEqual(loadInfo.currentMoveKind, 'loaded', 'loadInfo currentMoveKind no longer says loaded');
assert.equal(loadInfo.currentMoveKind, 'no_equipment', 'loadInfo records no-equipment state');
assert.ok(!loadInfo.routeLegsByDay, 'legacy loadInfo.routeLegsByDay remains removed');

console.log('verify-real-backup-loadinfo-clears-after-dropoff-v9574b passed');
