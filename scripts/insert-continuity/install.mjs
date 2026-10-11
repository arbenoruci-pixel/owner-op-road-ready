import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,before,after){const s=read(p);if(s.includes(after))return;assert.equal(s.split(before).length,2,'Insert continuity anchor: '+p);fs.writeFileSync(p,s.replace(before,()=>after));}
fs.copyFileSync('scripts/insert-continuity/projectDutyView.js','source/src/modules/logbook/projectDutyView.js');
const api='source/src/modules/logbook/public-api.js';
if(!read(api).includes("export {projectLogbookDutyView}"))fs.appendFileSync(api,"\nexport {projectLogbookDutyView} from './projectDutyView.js';\n");
const editor='source/src/modules/editor/InsertEditEventSheet.jsx';
patch(editor,'editorRangeError, projectLogbookEvents, previewLogbookInsertOverride','editorRangeError, projectLogbookEvents, projectLogbookDutyView, previewLogbookInsertOverride');
patch(editor,"const previewEvents = mode === 'insert' ? (insertResultV11023.ok ? projectLogbookEvents(","const previewEvents = mode === 'insert' ? (insertResultV11023.ok ? projectLogbookDutyView(");
const engine='source/src/modules/logbook/eventEditingV110.js';
patch(engine,"import { previousRecordedDuty }", "import {confirmedDrivingDayView} from './drivingDayViewV110372.js';\nimport { previousRecordedDuty }");
patch(engine,`  const projected=elapsedRows(state,day,at),clock=logbookClock(state,at);
  const last=projected.rows.filter(active).slice().sort((a,b)=>a.startMin-b.startMin).at(-1);`,
`  const elapsed=elapsedRows(state,day,at),clock=logbookClock(state,at);
  // Split a proven midnight continuation at the same boundary the driver sees.
  // The projection never changes the input; only Save can commit the split.
  const confirmed=confirmedDrivingDayView(elapsed.rows.filter(active).slice().sort((a,b)=>a.startMin-b.startMin),{state,day,clock,eventsByDay:state.eventsByDay}).at(-1);
  const projected=confirmed?.confirmedDrivingContinuationV110372 && event.endMin>confirmed.startMin
    ? {...elapsed,rows:elapsed.rows.map(row=>row.id===confirmed.id?{...row,endMin:confirmed.endMin}:row)}
    : elapsed;
  const last=projected.rows.filter(active).slice().sort((a,b)=>a.startMin-b.startMin).at(-1);`);
const locks=JSON.parse(read('module-locks.v1.json'));
locks.files[api]=crypto.createHash('sha256').update(read(api)).digest('hex');
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS Insert uses daily-graph continuity and preserves proven Driving outside the inserted interval');
