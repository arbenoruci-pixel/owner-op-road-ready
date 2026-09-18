import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const read = path => fs.readFileSync(path,'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const VERSION='110.3.72', BUILD='v110372-driving-day-continuity';
const dayPath='source/src/modules/logbook/DayLogScreen.jsx';
const locksPath='module-locks.v1.json', locks=JSON.parse(read(locksPath));
const original=read(dayPath);
assert.equal(hash(original),locks.files[dayPath],'Unexpected DayLogScreen runtime before Driving view correction');
const editingPath='source/src/modules/logbook/eventEditingV110.js', editingHash=hash(read(editingPath));
function patch(path,before,after,count=1) {
 const source=read(path);
 if(source.split(after).length-1===count)return;
 assert.equal(source.split(before).length-1,count,'Driving day anchor: '+path+' '+before.slice(0,100));
 fs.writeFileSync(path,source.replaceAll(before,after));
}
fs.copyFileSync('scripts/v110372/drivingDayView.js','source/src/modules/logbook/drivingDayViewV110372.js');
const dutyPath='source/src/modules/logbook/dutyViewV110212.js';
patch(dutyPath,"import { knownMidnightCarry, previousRecordedDuty }", "import {confirmedDrivingDayView} from './drivingDayViewV110372.js';\nimport { knownMidnightCarry, previousRecordedDuty }");
patch(dutyPath,'  if (!exactEvents.length) return continuousEvents;', '  if (!exactEvents.length) return continuousEvents;\n  exactEvents=confirmedDrivingDayView(exactEvents,context);');
patch(dayPath,
 'dutyViewEvents(exactViewEventsV110, displayEvents, { eventsByDay:state.eventsByDay, day:state.activeDay })',
 'dutyViewEvents(exactViewEventsV110, displayEvents, { eventsByDay:state.eventsByDay, day:state.activeDay, state, clock:clockV110 })',2);
patch(dayPath,
 'exactViewEventsV110, state.eventsByDay, state.routeLegsByDay, state.activeDay, state.activeLoadGuideId, state.loadGuidesById, state.loadInfo]',
 'exactViewEventsV110, state.eventsByDay, state.routeLegsByDay, state.activeDay, state.activeLoadGuideId, state.loadGuidesById, state.loadInfo, state.logbookEditHistoryByDay]');
assert.equal(hash(read(editingPath)),editingHash,'Edit/Insert contract must remain unchanged');
// Only the precisely anchored read-only context wiring changes in this protected
// file. All other protected module hashes remain as recorded by the prior build.
locks.files[dayPath]=hash(read(dayPath));
locks.release=VERSION;
fs.writeFileSync(locksPath,JSON.stringify(locks,null,2)+'\n');
for(const path of ['release-version.json','public/app-version.json']) {
 const value=JSON.parse(read(path));
 const stamp=value.version===VERSION?value.releasedAt:new Date().toISOString();
 Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.72 Driving across midnight',
  releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
  notes:['Keep the originating-day Driving line through midnight when the next-day record explicitly links to that trip.',
   'Keep current-day Driving at the home-terminal Now; preserve manually ended and unrelated Driving intervals.',
   'Read-only graph/list correction preserves stored events, locations, signatures and edit history.']});
 fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']) {
 const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
 fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,prefix] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
 let value=read(path);
 for(const [name,text] of [['VERSION',VERSION],['BUILD',BUILD]]) {
  const expression=new RegExp(`const ${prefix}_${name}\\s*=\\s*['"][^'"]+['"];?`,'g');
  assert.equal([...value.matchAll(expression)].length,1,'Release marker '+path+' '+name);
  value=value.replace(expression,`const ${prefix}_${name} = '${text}';`);
 }
 fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])
 fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs'])
 fs.writeFileSync(path,read(path).replaceAll("'110.3.70'","'"+VERSION+"'").replaceAll("'v110370-durable-route-removal'","'"+BUILD+"'"));
console.log('PASS — 110.3.72 evidence-linked Driving day view installed; raw Edit/Insert and all other protected modules unchanged');
