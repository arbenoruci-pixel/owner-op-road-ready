import assert from 'node:assert/strict';
import { mileageEvidenceForLoadV10976 } from '../source/src/modules/owneros/loadEvidenceV10976.js';
const state={
 eventsByDay:{'2026-07-26':[{loadNo:'97155',logDate:'2026-07-25',status:'D'}]},
 dailyMilesByDay:{'2026-07-26':{date:'2026-07-25',total:684},'2026-07-24':{date:'2026-07-24',total:510}},
 routeLegsByDay:{'2026-07-26':[{loadNo:'97155',eventDate:'2026-07-25'}]}
};
const result=mileageEvidenceForLoadV10976(state,'97155');
assert.deepEqual(result.linkedDays,['2026-07-25']);
assert.equal(result.total,684);
assert.equal(result.rows[0].day,'2026-07-25');
assert.ok(!result.rows.some(row=>row.day==='2026-07-26'));
console.log('PASS — mileage follows the load event date, not today or the storage container day');