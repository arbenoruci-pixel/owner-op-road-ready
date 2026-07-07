import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeRoadReadyState } from '../source/src/core/routes/routeNormalization.js';

const normalized = normalizeRoadReadyState({
  eventsByDay:{
    '2026-07-05':[
      { id:'d1', status:'D', startMin:885, endMin:1109, city:'Chicago', state:'IL', shippingDocs:'111Y7Z983', loadNo:'111Y7Z983' },
      { id:'on-stale', status:'OFF', startMin:1305, endMin:1440, city:'Maumee', state:'OH', loadNo:'114RMB689', shippingDocs:'114RMB689' },
    ],
    '2026-07-07':[
      { id:'empty-d', status:'D', startMin:26, endMin:215, city:'Greenfield', state:'IN', loadNo:'113NRH53Z', shippingDocs:'113NRH53Z' },
    ],
  },
  routeLegsByDay:{
    '2026-07-07':[{ id:'empty', day:'2026-07-07', pickupDay:'2026-07-07', kind:'empty/reposition', fromCity:'Greenfield', fromState:'IN', toCity:'Chicago', toState:'IL', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', status:'open' }],
  },
  loadInfo:{
    loadNo:'113NRH53Z', shippingDocs:'113NRH53Z', deliveryCity:'Greenfield', deliveryState:'IN',
    routeLegsByDay:{
      '2026-07-05':[
        { id:'legacy-114RMB689', day:'2026-07-05', pickupDay:'2026-07-05', deliveryEventId:'on-stale', fromCity:'Perrysburg', fromState:'OH', toCity:'North Baltimore', toState:'OH', shippingDocs:'114RMB689', loadNo:'114RMB689', miles:33, status:'delivered' },
      ],
    },
  },
});

assert.ok(normalized.routeLegsByDay['2026-07-05'].some(leg => leg.loadNo === '114RMB689'), 'legacy loadInfo route leg merged to canonical top-level routeLegsByDay');
assert.ok(!normalized.loadInfo.routeLegsByDay, 'legacy loadInfo.routeLegsByDay removed');
const repaired = normalized.eventsByDay['2026-07-05'].find(event => event.id === 'on-stale');
assert.equal(`${repaired.city}, ${repaired.state}`, 'North Baltimore, OH', 'stale non-driving Maumee label repaired from linked route destination');
const emptyLeg = normalized.routeLegsByDay['2026-07-07'][0];
assert.equal(emptyLeg.loadNo, '', 'empty/reposition route leg does not keep old loaded BOL by default');
assert.equal(normalized.loadInfo.loadNo, '', 'loadInfo does not carry prior Amazon load onto empty/reposition move');

const backupSrc = fs.readFileSync('source/src/modules/backup/BackupLogsScreen.jsx', 'utf8');
const appSrc = fs.readFileSync('source/src/app/App.jsx', 'utf8');
assert.ok(backupSrc.includes('normalizeRoadReadyState'), 'backup export normalizes legacy route data');
assert.ok(appSrc.includes('normalizeRoadReadyState(normalized)'), 'import/load normalizeState normalizes legacy route data');

console.log('verify-import-normalizes-legacy-route-data-v9574 passed');
