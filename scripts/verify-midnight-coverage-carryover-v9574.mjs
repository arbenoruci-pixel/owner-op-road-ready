import assert from 'node:assert/strict';
import { rawCoverageIssues, buildCoverageFixGroup } from '../source/src/core/compliance/rawRodsChecks.js';
import { analyzeLinkedHos } from '../source/src/core/hos/hosEngine.js';

const eventsByDay = {
  '2026-07-05': [
    { id:'prev_on', status:'ON', startMin:1300, endMin:1380, city:'North Baltimore', state:'OH' },
    { id:'prev_sb', status:'SB', startMin:1380, endMin:1440, city:'North Baltimore', state:'OH' },
  ],
  '2026-07-06': [
    { id:'off0038', status:'OFF', startMin:38, endMin:40, city:'North Baltimore', state:'OH' },
    { id:'on0040', status:'ON', startMin:40, endMin:48, city:'North Baltimore', state:'OH', note:'Drop & Hook' },
    { id:'d0048', status:'D', startMin:48, endMin:252, city:'North Baltimore', state:'OH', note:'Driving started' },
    { id:'on0412', status:'ON', startMin:252, endMin:260, city:'Indianapolis', state:'IN' },
    { id:'sb0420', status:'SB', startMin:260, endMin:1440, city:'Indianapolis', state:'IN' },
  ],
};

const coverage = rawCoverageIssues(eventsByDay, '2026-07-06', { currentLocation:{ city:'Indianapolis', state:'IN' } });
assert.equal(coverage.issues.some(issue => issue.code === 'day_start_gap' || /38m/.test(String(issue.detail || ''))), false, 'midnight carryover removes false 38m day-start gap');
assert.equal(buildCoverageFixGroup(coverage, '2026-07-06'), null, 'coverage wizard should not be required for carryover block');
assert.equal(Math.round(Number(coverage.total || 0)), 1440, 'derived carryover gives full day coverage for signing checks');

const hos = analyzeLinkedHos(eventsByDay, '2026-07-06', {});
const warningText = (hos.warnings || []).map(w => w.text || '').join('\n');
assert.ok(!/current rest\s*2m|2m\s*\/\s*10h/i.test(warningText), 'rest check must not reset to 2m at midnight when prior SB/OFF carried over');

console.log('verify-midnight-coverage-carryover-v9574 passed');
