import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const root=path.resolve(process.argv[2]||process.cwd());
const mod=name=>import(pathToFileURL(path.join(root,name)).href);
const h=await mod('source/src/core/hos/hosEngine.js');
const edit=await mod('source/src/modules/logbook/eventEditingV110.js');
const backup=await mod('source/src/core/backup/dayTransfer.js');
const account=await mod('lib/owner-op-cloud/accountCoreV110455.js');
const time=await mod('source/src/core/time/homeTerminalTime.js');
const certification=await mod('source/src/modules/logbook/certificationV110.js');
const team=await mod('source/src/core/team/teamLogbook.js');
let passed=0;
const test=(name,run)=>{run();passed++;console.log('PASS — '+name);};
const e=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,source:'manual',city:'Synthetic',state:'IL',...extra});
const eventsByDay={
 '2026-10-16':[e('prior','OFF',0,1440)],
 '2026-10-17':[e('r','OFF',0,300),e('on','ON',300,480),e('d1','D',480,720),e('short','OFF',720,900),e('d2','D',900,1260),e('sb1','SB',1260,1440)],
 '2026-10-18':[e('sb2','SB',0,300),e('d3','D',300,360)]
};
const state={activeDriverId:'driver_test',activeDay:'2026-10-17',currentStatus:'D',homeTerminalTimeZone:'America/Chicago',eventsByDay,
 hosSettings:{cycleHours:70,cycleDays:8,jurisdiction:'US_INTERSTATE_PROPERTY',splitSleeperEnabled:true,confirmedAt:'2026-01-01T00:00:00Z',source:'Synthetic carrier policy'},
 logTimeZoneByDay:{'2026-10-17':'America/Chicago'},signatureByDay:{'2026-10-17':{signed:true,testSignature:true}},certifyStatus:{'2026-10-17':'Certified'},logbookEditHistoryByDay:{'2026-10-17':[{kind:'earlier-synthetic-edit'}]}};
const at=new Date('2026-10-18T11:00:00Z');
test('installed live clocks and yesterday review share the completed overnight split calculation',()=>{
 const saved=JSON.stringify(state),clock=h.calculateHosClocks(state,at),ranges=h.violationRangesForDay(eventsByDay,'2026-10-17',{state,now:at});
 assert.equal(clock.splitSleeper.complete,true);assert.equal(clock.drive.remainingMinutes,240);
 assert.equal(ranges.some(r=>r.type==='window14'),false);assert.deepEqual(ranges,h.analyzeLinkedHos(eventsByDay,'2026-10-17',state.certifyStatus,{state,now:at}).violationRanges);
 assert.equal(JSON.stringify(state),saved);
});
test('installed editor retains metadata-only history and leaves prior event bytes intact',()=>{
 const saved=JSON.stringify(state),row=eventsByDay['2026-10-17'][1];
 const command={day:'2026-10-17',id:row.id,expected:structuredClone(row),expectedRows:structuredClone(eventsByDay['2026-10-17']),patch:{note:'Synthetic verified remark'}};
 const result=edit.applyLogbookEditorEdit(state,command,at);
 assert.equal(result.ok,true);assert.equal(result.changed,true);
 const history=result.state.logbookEditHistoryByDay['2026-10-17'];
 assert.equal(history.length,2);assert.deepEqual(history[0],state.logbookEditHistoryByDay['2026-10-17'][0]);
 assert.deepEqual(history[1].beforeEvents,eventsByDay['2026-10-17']);
 assert.equal(history[1].afterEvents.find(e=>e.id===row.id).note,'Synthetic verified remark');
 assert.equal(JSON.stringify(state),saved);
});
test('editor refuses stale event and neighboring-row changes before applying a temporal edit',()=>{
 const row=eventsByDay['2026-10-17'][1],stale=structuredClone(state);stale.eventsByDay['2026-10-17'][0].note='changed elsewhere';
 const command={day:'2026-10-17',id:row.id,expected:structuredClone(row),expectedRows:structuredClone(eventsByDay['2026-10-17']),patch:{startMin:330}};
 assert.equal(edit.applyLogbookEditorEdit(stale,command,at).ok,false);
 const eventStale=structuredClone(state);eventStale.eventsByDay['2026-10-17'][1].city='Another city';
 assert.equal(edit.applyLogbookEditorEdit(eventStale,command,at).ok,false);
});
test('old-day zone and edit history survive export, isolated restore, and reopening',()=>{
 const old={...state,homeTerminalTimeZone:'America/Chicago',homeTerminalOriginalTimeZone:'America/New_York',logTimeZoneByDay:{'2026-10-17':'America/New_York'}};
 const exported=backup.buildDayBackupPayload(old,'2026-10-17','reliability-test');
 assert.equal(exported.homeTerminalTimeZone,'America/New_York');assert.deepEqual(exported.dayData.editHistory,old.logbookEditHistoryByDay['2026-10-17']);
 const restored=backup.applyDayBackupToState({homeTerminalTimeZone:'America/Chicago',eventsByDay:{},signatureByDay:{}},structuredClone(exported),'2026-10-17');
 assert.equal(time.getLogDayTimeZone(restored,'2026-10-17'),'America/New_York');
 assert.deepEqual(restored.logbookEditHistoryByDay['2026-10-17'][0],old.logbookEditHistoryByDay['2026-10-17'][0]);
 assert.equal(restored.logbookEditHistoryByDay['2026-10-17'].at(-1).kind,'day_restore');
 assert.deepEqual(backup.buildDayBackupPayload(restored,'2026-10-17').dayData.events,exported.dayData.events);
});
test('account sync keeps day zone and edit history in the same signed driver-day conflict record',()=>{
 const records=account.recordsFrom({state}),dayKey=JSON.stringify(['day','driver_test','2026-10-17']);
 assert.equal(records[dayKey].logTimeZoneByDay,'America/Chicago');
 assert.deepEqual(records[dayKey].logbookEditHistoryByDay,state.logbookEditHistoryByDay['2026-10-17']);
 assert.deepEqual(records[dayKey].signatureByDay,state.signatureByDay['2026-10-17']);
 const reopened=account.bundleFrom(records,{activeDriverId:'driver_test'}).state;
 assert.deepEqual(reopened.eventsByDay,state.eventsByDay);assert.deepEqual(reopened.logTimeZoneByDay,state.logTimeZoneByDay);assert.deepEqual(reopened.logbookEditHistoryByDay,state.logbookEditHistoryByDay);
 const local=structuredClone(records),remote=structuredClone(records);local[dayKey].eventsByDay[0].note='local edit';remote[dayKey].logTimeZoneByDay='America/New_York';
 const merged=account.mergeRecords(records,local,remote);
 assert.equal(merged.conflicts.length,1);assert.equal(merged.conflicts[0].key,dayKey);
 assert.equal(account.workingRecord(JSON.stringify(['state','homeTerminalTimeZoneHistory'])),true);
 assert.equal(account.workingRecord(JSON.stringify(['state','hosProfileHistory'])),true);
});
test('existing signed certification context retains its historical zone after a terminal proposal',()=>{
 const old={...state,signatureByDay:{'2026-10-17':{signed:true,certificationContext:{version:1,form:{},homeTimezone:'America/New_York'}}}};
 const before=certification.certificationContent(old,'2026-10-17');
 const proposed={...old,homeTerminalTimeZoneChangeProposal:{timeZone:'America/Chicago',effectiveAt:null,status:'pending_boundary_review'}};
 assert.deepEqual(certification.certificationContent(proposed,'2026-10-17'),before);
});
test('switching drivers keeps each driver’s day timezone and edit history isolated',()=>{
 const input={...state,teamDrivers:[{id:'driver_test',name:'Synthetic A'},{id:'driver_other',name:'Synthetic B'}],teamLogbooksByDriverId:{driver_other:{activeDay:'2026-10-17',eventsByDay:{'2026-10-17':[e('other','OFF',0,1440)]},logTimeZoneByDay:{'2026-10-17':'America/New_York'},logbookEditHistoryByDay:{'2026-10-17':[{kind:'other-driver-history'}]}}}};
 const switched=team.switchTeamDriver(input,'driver_other','2026-10-18');
 assert.equal(switched.logTimeZoneByDay['2026-10-17'],'America/New_York');assert.equal(switched.logbookEditHistoryByDay['2026-10-17'][0].kind,'other-driver-history');
 const back=team.switchTeamDriver(switched,'driver_test','2026-10-18');
 assert.deepEqual(back.logTimeZoneByDay,state.logTimeZoneByDay);assert.deepEqual(back.logbookEditHistoryByDay,state.logbookEditHistoryByDay);
});

const require=createRequire(path.join(root,'package.json'));
let babel;
try{babel=require('next/dist/compiled/babel/core');}catch{
 const dependencyRoot=process.env.ROAD_READY_TEST_DEPENDENCIES;
 if(dependencyRoot)babel=createRequire(path.join(dependencyRoot,'package.json'))('next/dist/compiled/babel/core');
}
if(babel)test('candidate JSX parses and Next client directives remain ahead of imports',()=>{
 for(const name of ['source/src/app/App.jsx','source/src/shared/ui/TimeZoneSheet.jsx','source/src/shared/ui/HosProfileSheet.jsx','source/src/modules/editor/EditEventSheet.jsx','source/src/modules/editor/InsertEditEventSheet.jsx','source/src/modules/editor/HosImpactPreview.jsx','source/src/modules/drive/HosCompactClocks.jsx','source/src/modules/drive/DriveModeScreen.jsx','source/src/modules/logbook/LogbookHomeScreen.jsx','source/src/modules/logbook/DayLogScreen.jsx','source/src/modules/logbook/BulkMovePanelV110409.jsx']) {
  const source=fs.readFileSync(path.join(root,name),'utf8');
  const parsed=babel.parseSync(source,{filename:name,sourceType:'module',configFile:false,babelrc:false,parserOpts:{plugins:['jsx']}});
  if(source.includes("'use client';")||source.includes('"use client";'))assert.equal(parsed.program.directives.some(d=>d.value.value==='use client'),true,`${name}: misplaced client directive`);
 }
});else throw Error('Set ROAD_READY_TEST_DEPENDENCIES to the isolated baseline with Next.js dependencies for the JSX parse gate.');
console.log(`${passed} installed-runtime HOS regression groups passed`);
