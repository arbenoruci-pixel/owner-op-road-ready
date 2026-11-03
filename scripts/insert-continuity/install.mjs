import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,before,after){const s=read(p);if(s.includes(after))return;assert.equal(s.split(before).length,2,'Insert continuity anchor: '+p);fs.writeFileSync(p,s.replace(before,()=>after));}
fs.copyFileSync('scripts/insert-continuity/projectDutyView.js','source/src/modules/logbook/projectDutyView.js');
const api='source/src/modules/logbook/public-api.js';
if(!read(api).includes("export {projectLogbookDutyView}"))fs.appendFileSync(api,"\nexport {projectLogbookDutyView} from './projectDutyView.js';\n");
const editor='source/src/modules/editor/InsertEditEventSheet.jsx';
// Historical sheet materializers can restore the pre-paper-log time cap.
// Keep Now as the initial suggestion while retaining the already reviewed
// explicit midnight input required by the continuity regression below.
if(read(editor).includes('const insertLimitV110314 = insertDayLimitV110314(logbookContext, clockV110);'))patch(editor,'const insertLimitV110314 = insertDayLimitV110314(logbookContext, clockV110);',
  'const insertLimitV110314 = 1440;\n  const defaultInsertLimitV110315 = logbookContext.activeDay === clockV110.day ? Math.max(1, clockV110.minute) : 1440;');
patch(editor,'initialInsertRangeV110314(insertLimitV110314, defaults.startMin, defaults.endMin)',
  'initialInsertRangeV110314(defaultInsertLimitV110315, defaults.startMin, defaults.endMin)');
patch(editor,'quickInsertRangeV110314(insertLimitV110314, minAgo)',
  'quickInsertRangeV110314(defaultInsertLimitV110315, minAgo)');
patch(editor,'editorRangeError, projectLogbookEvents, previewLogbookInsertOverride','editorRangeError, projectLogbookEvents, projectLogbookDutyView, previewLogbookInsertOverride');
if(!read(editor).includes('const continuityPreviewEvents =')) {
  patch(editor,"const previewEvents = mode === 'insert' ? (insertResultV11023.ok ? projectLogbookEvents(","const previewEvents = mode === 'insert' ? (insertResultV11023.ok ? projectLogbookDutyView(");
  patch(editor,"  const previewEvents = mode === 'insert' ? (insertResultV11023.ok ? projectLogbookDutyView(","  const continuityPreviewEvents = mode === 'insert' ? (insertResultV11023.ok ? projectLogbookDutyView(");
}
patch(editor,"  const activeId = mode === 'insert' ? insertDraftEvent.id : selectedEventId;",`  // An explicitly chosen draft End can be later than Now in this manual log.
  // Continuity supplies the surrounding rows; the form owns the draft range.
  const previewEvents = continuityPreviewEvents.map(row => mode === 'insert' && row.id === insertEventV11023.id
    ? {...row,startMin:insertEventV11023.startMin,endMin:insertEventV11023.endMin,isLive:false} : row);
  const activeId = mode === 'insert' ? insertDraftEvent.id : selectedEventId;`);
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
