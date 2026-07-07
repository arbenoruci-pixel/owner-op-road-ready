import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeRoadReadyState, routeLegsForDayCanonical } from '../source/src/core/routes/routeNormalization.js';

const state = {
  routeLegsByDay: {
    '2026-07-05': [
      { id:'top-111Y7Z983', day:'2026-07-05', pickupDay:'2026-07-05', fromCity:'Chicago', fromState:'IL', toCity:'Bristol', toState:'IN', shippingDocs:'111Y7Z983', loadNo:'111Y7Z983', miles:123, status:'delivered' },
    ],
  },
  loadInfo: {
    loadNo:'113NRH53Z',
    routeLegsByDay: {
      '2026-07-05': [
        { id:'legacy-111J98KGR', day:'2026-07-05', pickupDay:'2026-07-05', fromCity:'Bristol', fromState:'IN', toCity:'Perrysburg', toState:'OH', shippingDocs:'111J98KGR', loadNo:'111J98KGR', miles:135, chassis:'UPHZ 531029', status:'delivered' },
      ],
      '2026-07-06': [
        { id:'legacy-113NRH53Z', day:'2026-07-06', pickupDay:'2026-07-06', fromCity:'North Baltimore', fromState:'OH', toCity:'Greenfield', toState:'IN', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', miles:206, status:'delivered' },
      ],
    },
  },
};

const normalized = normalizeRoadReadyState(state);
assert.ok(normalized.routeLegsByDay?.['2026-07-05']?.some(leg => leg.loadNo === '111Y7Z983'), 'top-level canonical route legs preserved');
assert.ok(normalized.routeLegsByDay?.['2026-07-05']?.some(leg => leg.loadNo === '111J98KGR'), 'legacy loadInfo route leg merged into canonical routeLegsByDay');
assert.ok(!normalized.loadInfo?.routeLegsByDay, 'legacy loadInfo.routeLegsByDay removed after normalization');
assert.equal(routeLegsForDayCanonical(normalized, '2026-07-06')[0]?.miles, 206, 'canonical route helper reads July 6 route miles');

const app = fs.readFileSync('source/src/app/App.jsx', 'utf8');
const form = fs.readFileSync('source/src/modules/logbook/DayLogScreen.jsx', 'utf8');
const sign = fs.readFileSync('source/src/modules/logbook/signing.js', 'utf8');
const dot = fs.readFileSync('source/src/core/dot/dotOfficerCheckEngine.js', 'utf8');
const backup = fs.readFileSync('source/src/modules/backup/BackupLogsScreen.jsx', 'utf8');
assert.ok(app.includes('normalizeRoadReadyState'), 'app load/import path uses route normalizer');
assert.ok(form.includes('routeLegsForDayCanonical'), 'Form tab reads canonical route legs');
assert.ok(sign.includes('routeLegsForDayCanonical'), 'Sign tab reads canonical route legs');
assert.ok(dot.includes('routeLegsForDayCanonical'), 'DOT Check reads canonical route legs');
assert.ok(backup.includes('normalizeRoadReadyState'), 'Backup export normalizes canonical route metadata');

console.log('verify-route-single-source-v9574 passed');
