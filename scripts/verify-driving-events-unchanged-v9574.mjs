import assert from 'node:assert/strict';
import { normalizeRoadReadyState, drivingEventSignatureByDay } from '../source/src/core/routes/routeNormalization.js';

const state = {
  eventsByDay:{
    '2026-07-05':[
      { id:'d-111', status:'D', startMin:885, endMin:1109, city:'Chicago', state:'IL', shippingDocs:'111Y7Z983', loadNo:'111Y7Z983' },
      { id:'on-transition', status:'ON', startMin:1109, endMin:1120, city:'Bristol', state:'IN', shippingDocs:'111Y7Z983 / 111J98KGR', loadNo:'111Y7Z983 / 111J98KGR' },
      { id:'d-114', status:'D', startMin:1200, endMin:1305, city:'Bristol', state:'IN', shippingDocs:'111J98KGR', loadNo:'111J98KGR' },
    ],
    '2026-07-06':[
      { id:'d-113', status:'D', startMin:48, endMin:252, city:'North Baltimore', state:'OH', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z' },
    ],
    '2026-07-07':[
      { id:'d-empty', status:'D', startMin:26, endMin:215, city:'Greenfield', state:'IN', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z' },
    ],
  },
  routeLegsByDay:{
    '2026-07-07':[{ id:'empty', day:'2026-07-07', pickupDay:'2026-07-07', kind:'empty/reposition', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', status:'open' }],
  },
  loadInfo:{ loadNo:'113NRH53Z', shippingDocs:'113NRH53Z', routeLegsByDay:{ '2026-07-06':[{ id:'legacy', day:'2026-07-06', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', miles:206 }] } },
};

const before = drivingEventSignatureByDay(state);
const normalized = normalizeRoadReadyState(state);
const after = drivingEventSignatureByDay(normalized);
assert.deepEqual(after, before, 'normalizers must not change DRIVING event id/status/start/end');
for (const [day, rows] of Object.entries(normalized.eventsByDay)) {
  rows.filter(row => row.status === 'D').forEach(row => {
    const original = state.eventsByDay[day].find(item => item.id === row.id);
    assert.equal(row.startMin, original.startMin, `${row.id} startMin unchanged`);
    assert.equal(row.endMin, original.endMin, `${row.id} endMin unchanged`);
    assert.equal(row.status, 'D', `${row.id} status remains D`);
  });
}

console.log('verify-driving-events-unchanged-v9574 passed');
