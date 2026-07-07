import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeRoadReadyState } from '../source/src/core/routes/routeNormalization.js';

const status = fs.readFileSync('source/src/modules/status/StatusWorkflowSheet.jsx', 'utf8');
const app = fs.readFileSync('source/src/app/App.jsx', 'utf8');
assert.ok(status.includes("'Hook Empty / Reposition'"), 'Status workflow includes Hook Empty / Reposition reason');
assert.ok(status.includes("mode: reasonNeedsDropOff(status, selectedReasons) ? 'drop_off' : (reasonNeedsDropHook(status, selectedReasons) ? 'drop_hook' : (hookEmpty ? 'hook_empty' : ''))"), 'payload distinguishes drop_off, drop_hook, and hook_empty modes');
assert.ok(status.includes('Add the new BOL/load #, or choose Hook Empty / Reposition'), 'loaded Drop & Hook requires a new load number');
assert.ok(status.includes('will not reuse the previous load number'), 'UI explains hook empty does not reuse old load');
assert.ok(app.includes('function isHookEmptyReason'), 'app detects Hook Empty / Reposition action');
assert.ok(app.includes("source:hookEmpty ? 'hook_empty_reposition_event' : 'drop_hook_event'"), 'hook empty creates empty/reposition route leg source');
assert.ok(app.includes("currentMoveKind:hookEmpty ? 'empty/reposition' : 'loaded'"), 'load patch marks hook empty as empty/reposition');
assert.ok(!app.includes('dropHook.hookedLoadNo || shippingDocs || loadNo'), 'drop/hook save does not fall back to prior load number');

const normalized = normalizeRoadReadyState({
  routeLegsByDay:{
    '2026-07-07': [
      { id:'empty', day:'2026-07-07', pickupDay:'2026-07-07', fromCity:'Greenfield', fromState:'IN', toCity:'Chicago', toState:'IL', kind:'empty/reposition', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', container:'AZNU999999', chassis:'UPHZ999999', status:'open' },
    ],
  },
  loadInfo:{ loadNo:'113NRH53Z', shippingDocs:'113NRH53Z', deliveryCity:'Chicago', deliveryState:'IL' },
  equipment:{ type:'intermodal', container:'AZNU999999', chassis:'UPHZ999999' },
});
const emptyLeg = normalized.routeLegsByDay['2026-07-07'][0];
assert.equal(emptyLeg.kind, 'empty/reposition', 'normalizer keeps empty/reposition kind');
assert.equal(emptyLeg.loadNo, '', 'normalizer strips stale old load number from empty/reposition leg');
assert.equal(normalized.loadInfo.loadNo, '', 'current loadInfo cleared for empty move without explicit EMPTY/MT reference');

console.log('verify-intermodal-dropoff-hookempty-v9574 passed');
