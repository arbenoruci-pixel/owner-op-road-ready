import assert from 'node:assert/strict';
import {register} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {projectLogbookEvents} from '../source/src/modules/logbook/eventEditingV110.js';
import {dutyViewEvents} from '../source/src/modules/logbook/dutyViewV110212.js';
import {displayEventsForDayFromState} from '../source/src/core/timeline/displayTimeline.js';
import {homeTerminalDayKey,homeTerminalMinute} from '../source/src/core/time/homeTerminalTime.js';
import {applyManualDrivingMidnightContinuity} from '../source/src/core/timeline/manualDrivingContinuity.js';
register(new URL('./test-jsx-loader.mjs',import.meta.url));
const {default:Editor,buildDailyMileageSegments:build,allocateMiles}=await import('../source/src/modules/logbook/MileageSegmentEditor.jsx');
const row=(id,status,startMin,endMin,city='Chicago',state='IL',extra={})=>({id,status,startMin,endMin,city,state,source:'manual',...extra});
const day='2026-09-16';
const reported=[row('sb','SB',0,617,'New York','NY'),row('pti','ON',617,632,'New York','NY'),row('a','D',632,725,'New York','NY'),row('off','OFF',725,851,'Ridgefield','NJ'),row('b','D',851,962,'Ridgefield','NJ'),row('off2','OFF',962,1090,'Saugerties','NY'),row('on2','ON',1090,1110,'Saugerties','NY'),row('c','D',1110,1440,'Saugerties','NY')];
let count=0;function test(name,fn){fn();count++;console.log('PASS — '+name);}
test('the reported day contains all three driving segments, including 5h30 without a stop',()=>{
 const before=structuredClone(reported),segments=build(reported);
 assert.equal(segments.length,3);assert.deepEqual(segments.map(s=>s.drivingEvents.map(e=>e.id)),[['a'],['b'],['c']]);
 assert.equal(segments[2].continues,true);assert.equal(segments[2].to.label,'Continues');assert.equal(segments[2].drivingMinutes,330);assert.equal(segments[2].miles,341);assert.equal(segments[2].averageMph,62);assert.equal(segments[2].confidence,'Low');
 assert.deepEqual(segments.slice(0,2).map(s=>[s.from.label,s.to.label,s.startMin,s.endMin]),[['New York, NY','Ridgefield, NJ',632,725],['Ridgefield, NJ','Saugerties, NY',851,962]]);
 assert.deepEqual(reported,before);
});
test('existing verified routes retain their estimates and a same-city drive is never skipped',()=>{
 const segments=build([row('a','D',0,60),row('stop','ON',60,90,'Elgin'),row('b','D',90,180,'Elgin'),row('stop2','OFF',180,250,'Woodhaven','MI')]);
 assert.deepEqual(segments.map(s=>s.miles),[52,327]);
 const same=build([row('local','D',0,60),row('stop','OFF',60,150),row('next','D',150,210),row('far','OFF',210,300,'Elgin')]);
 assert.equal(same.length,2);assert.equal(same[0].to.label,'Chicago, IL');assert.equal(same[0].continues,false);assert.equal(same[0].miles,62);
});
test('continuous driving fragments and short breaks count only Driving minutes',()=>{
 const events=[row('a','D',0,60),row('b','D',60,120),row('break','OFF',120,150),row('c','D',150,210)];
 const segments=build(events);assert.equal(segments.length,1);assert.equal(segments[0].drivingMinutes,180);assert.equal(segments[0].miles,186);
 const allocations=allocateMiles(segments[0],200.01);assert.deepEqual(allocations.map(a=>a.eventId),['a','b','c']);assert.equal(Number(allocations.reduce((sum,a)=>sum+a.miles,0).toFixed(2)),200.01);
 const separated=build([row('a','D',0,60),row('b','D',90,120)]);assert.equal(separated.length,2);assert.equal(separated.reduce((sum,s)=>sum+s.drivingMinutes,0),90);
});
test('zero-length, out-of-day and synthetic rows cannot generate chargeable miles',()=>{
 assert.deepEqual(build([row('zero','D',100,100),row('outside','D',1300,1500),row('derived','D',0,120,'Chicago','IL',{displayOnly:true}),row('rest','OFF',0,1440)]),[]);
});
function view(state,at){const clockDay=homeTerminalDayKey(at,state.homeTerminalTimeZone),minute=homeTerminalMinute(at,state.homeTerminalTimeZone);return dutyViewEvents(projectLogbookEvents(state,day,at),displayEventsForDayFromState(state.eventsByDay,day,{today:clockDay,nowMinute:minute,currentStatus:state.currentStatus}),{eventsByDay:state.eventsByDay,day});}
test('live Driving uses home-terminal Now and a closed day ends at midnight',()=>{
 const events=structuredClone(reported);events.at(-1).endMin=1111;events.at(-1).source='live_status';
 const state={activeDay:day,homeTerminalTimeZone:'America/New_York',currentStatus:'D',eventsByDay:{[day]:events}};
 const before=structuredClone(state);
 const live=build(view(state,new Date('2026-09-17T00:30:00Z'))).at(-1);assert.equal(live.endMin,1230);assert.equal(live.drivingMinutes,120);assert.equal(live.miles,124);
 const rolled=applyManualDrivingMidnightContinuity(state,{previousDay:day,currentDay:'2026-09-17',nowMinute:120});
 const closed=build(view(rolled,new Date('2026-09-17T06:00:00Z'))).at(-1);assert.equal(closed.endMin,1440);assert.equal(closed.miles,341);
 const continuation=build(projectLogbookEvents(rolled,'2026-09-17',new Date('2026-09-17T06:00:00Z')))[0];assert.equal(continuation.startMin,0);assert.equal(continuation.endMin,120);assert.equal(continuation.miles,124);
 assert.deepEqual(state,before);
});
test('an explicitly ended driving event keeps its exact end even without a following stop',()=>{
 const events=structuredClone(reported);Object.assign(events.at(-1),{endMin:1170,paperLogEndV110315:true});
 const state={activeDay:day,homeTerminalTimeZone:'America/New_York',currentStatus:'OFF',eventsByDay:{[day]:events}};
 const segment=build(view(state,new Date('2026-09-17T06:00:00Z'))).at(-1);assert.equal(segment.endMin,1170);assert.equal(segment.miles,62);
});
test('actual React renders the continued time formula, accessible miles and previously reviewed values',()=>{
 const events=structuredClone(reported);events.at(-1).manualMiles=325.5;
 const before=structuredClone(events),html=renderToStaticMarkup(React.createElement(Editor,{open:true,events}));
 assert.match(html,/Continues/);assert.match(html,/5h 30m/);assert.match(html,/62.*mph/);assert.match(html,/341.00.*mi estimate/);assert.match(html,/aria-label="Miles for segment 3"/);assert.match(html,/value="325.5"/);assert.match(html,/24:00/);assert.deepEqual(events,before);
 assert.equal(renderToStaticMarkup(React.createElement(Editor,{open:false,events})), '');
});
console.log(count+' continuous mileage regression groups passed');
