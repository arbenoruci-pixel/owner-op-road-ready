import fs from 'node:fs';
import {projectLogbookEvents} from '../../source/src/modules/logbook/eventEditingV110.js';
import {dutyViewEvents} from '../../source/src/modules/logbook/dutyViewV110212.js';
import {displayEventsForDayFromState} from '../../source/src/core/timeline/displayTimeline.js';
console.log('PROJECTION_SOURCE',projectLogbookEvents.toString());
console.log('DUTY_VIEW_SOURCE',dutyViewEvents.toString());
console.log('DISPLAY_SOURCE',displayEventsForDayFromState.toString());
const day='2026-09-17',next='2026-09-18';
const row={id:'drive-origin',status:'D',startMin:1325,endMin:1326,source:'manual_drive',city:'Synthetic',state:'OH'};
const state={activeDay:day,homeTerminalTimeZone:'America/New_York',currentStatus:'D',eventsByDay:{[day]:[row]},manualDrivingSession:{active:true,status:'D',eventId:'drive-origin',startDay:day,startMin:1325}};
for(const at of ['2026-09-18T03:42:00Z','2026-09-18T04:42:00Z'])console.log('BASELINE',at,JSON.stringify(projectLogbookEvents(state,day,new Date(at))));
const bridged=structuredClone(state);bridged.eventsByDay[next]=[{...row,id:'midnight',source:'manual_drive_midnight_continuation',startMin:0,endMin:1,crossMidnightFromDay:day,crossMidnightFromEventId:row.id,crossMidnightContinuation:true}];bridged.manualDrivingSession={...state.manualDrivingSession,eventId:'midnight',startDay:next,rolloverFromDay:day,rolloverFromEventId:row.id};
console.log('BRIDGED_ORIGIN',JSON.stringify(projectLogbookEvents(bridged,day,new Date('2026-09-18T04:42:00Z'))));
console.log('BRIDGED_NEXT',JSON.stringify(projectLogbookEvents(bridged,next,new Date('2026-09-18T04:42:00Z'))));
for(const file of ['source/src/app/App.jsx','source/src/modules/logbook/DayLogScreen.jsx','source/src/core/timeline/manualDrivingContinuity.js']) {
 const text=fs.readFileSync(file,'utf8');console.log('FILE',file,'LENGTH',text.length);
 const terms=file.includes('DayLog')?['exactViewEventsV110','dutyViewEvents(','const displayEvents']:file.includes('manualDriving')?['activeManualDrivingState','firstCurrent']:['manualDrivingSession:','manualDrivingSession ='];
 for(const term of terms){let cursor=0,count=0;while((cursor=text.indexOf(term,cursor))>=0&&count++<12){console.log('CONTEXT',term,text.slice(Math.max(0,cursor-400),Math.min(text.length,cursor+1400)));cursor+=term.length;}}
}
