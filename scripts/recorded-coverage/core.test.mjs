import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {fixture, day, at} from './fixture.mjs';
import {recordedCoverage, recordedDayView} from '../../source/src/core/compliance/recordedCoverage.js';
import {projectLogbookEvents, projectEditorLogbookEvents, logbookClock} from '../../source/src/modules/logbook/eventEditingV110.js';
import {displayEventsForDayFromState} from '../../source/src/core/timeline/displayTimeline.js';
import {dutyViewEvents} from '../../source/src/modules/logbook/dutyViewV110212.js';
import {readArchiveLogbookDay} from '../../source/src/modules/logbook/archiveDayV1103.js';
import {readLogbookReportDay} from '../../source/src/modules/logbook/reportDayV110391.js';
import {createCertificationRecord, certificationStatusV1032} from '../../source/src/modules/logbook/certificationV110.js';
import {validateLogForSigning, isFatalSigningIssue, signBlockMessage} from '../../source/src/modules/logbook/signing.js';
import {buildDayBackupPayload} from '../../source/src/core/backup/dayTransfer.js';
import {captureInspection} from '../../lib/owner-op-cloud/inspectionSnapshot.js';
import {inspectionReadiness} from '../../source/src/modules/dot/inspectionReadiness.js';
import {buildDotOfficerCheck} from '../../source/src/core/dot/dotOfficerCheckEngine.js';
mock.timers.enable({apis:['Date'],now:at});
const ranges = rows => rows.map(e => [e.status,e.startMin,e.endMin]);
const visible = (state, date=day, instant=at) => {
  const clock=logbookClock(state,instant);
  return dutyViewEvents(projectLogbookEvents(state,date,instant),displayEventsForDayFromState(state.eventsByDay,date,
    {today:clock.day,nowMinute:clock.minute,currentStatus:state.currentStatus}),{state,eventsByDay:state.eventsByDay,day:date,clock});
};
test('57-minute saved tail is identical in graph/list, editor, archive, report, JSON and signed inspection',()=>{
  const state=fixture(), before=structuredClone(state), expected=ranges(state.eventsByDay[day]);
  const backup=buildDayBackupPayload(state,day);
  const inspection=captureInspection(state,at).snapshots.find(row=>row.sourceDay===day);
  for(const rows of [visible(state),projectEditorLogbookEvents(state,day,at),readArchiveLogbookDay(state,day,at),
    readLogbookReportDay(state,day,at),backup.dayData.events,inspection.inspectionView.events]) assert.deepEqual(ranges(rows),expected);
  assert.deepEqual(recordedCoverage(state,day,at).gaps,[{startMin:1383,endMin:1440}]);
  assert.deepEqual(inspectionReadiness(state,at).days.find(row=>row.day===day).gaps,[{startMin:1383,endMin:1440}]);
  assert.equal(certificationStatusV1032(state,day).status,'Certified','original signature status is preserved separately from coverage');
  assert.deepEqual(state,before);
});
test('single and batch signing validation reject the exact missing payload without changing signatures',()=>{
  for(const signed of [false,true]) {
    const state=fixture({signed}), before=structuredClone(state);
    const issue=validateLogForSigning(state,day).find(row=>row.missingBlocks?.some(block=>block.startMin===1383&&block.endMin===1440));
    assert.ok(issue);assert.ok(isFatalSigningIssue(issue));assert.match(signBlockMessage(state,day),/57m/);
    assert.throws(()=>createCertificationRecord(state,day,{now:at.getTime()}),/Unrecorded time.*23:03/);
    assert.deepEqual(state,before);
  }
});
test('explicitly completed raw record signs and round-trips at midnight',()=>{
  const state=fixture({signed:false});state.eventsByDay[day].at(-1).endMin=1440;
  const before=structuredClone(state), signature=createCertificationRecord(state,day,{now:at.getTime()});
  assert.equal(signature.certifiedContent.events.at(-1).endMin,1440);
  assert.equal(recordedCoverage(state,day,at).issues.length,0);
  assert.deepEqual(state,before);
  assert.deepEqual(ranges(visible(JSON.parse(JSON.stringify(state)))),ranges(state.eventsByDay[day]));
});
test('one-minute gaps, interior gaps, overlaps and invalid ranges cannot become clean coverage',()=>{
  for(const mutate of [s=>s.eventsByDay[day].at(-1).endMin=1439,s=>s.eventsByDay[day][2].startMin++,
    s=>s.eventsByDay[day][2].startMin--,s=>s.eventsByDay[day][2].endMin=1500,
    s=>s.eventsByDay[day][2].startMin='437']) {
    const state=fixture({signed:false});state.eventsByDay[day].at(-1).endMin=1440;mutate(state);
    assert.ok(recordedCoverage(state,day,at).issues.length);
    assert.throws(()=>createCertificationRecord(state,day,{now:at.getTime()}),/Review the recorded log/);
  }
});
test('every past-day duty status preserves its one-minute stub and longer saved end',()=>{
  for(const status of ['OFF','SB','ON','D'])for(const endMin of [1354,1383]) {
    const state=fixture();Object.assign(state.eventsByDay[day].at(-1),{status,endMin});
    assert.equal(visible(state).at(-1).endMin,endMin);
    assert.equal(readLogbookReportDay(state,day,at).at(-1).endMin,endMin);
    assert.equal(recordedCoverage(state,day,at).missingMinutes,1440-endMin);
  }
});
test('current live duty still advances to Now using the home terminal, including the midnight boundary',()=>{
  const state=fixture({signed:false});state.homeTerminalTimeZone='America/Chicago';state.currentStatus='SB';
  const before=structuredClone(state), instant=new Date('2026-11-07T05:45:00Z');
  assert.equal(recordedCoverage(state,day,instant),null);
  assert.equal(visible(state,day,instant).at(-1).endMin,1425);
  assert.equal(visible(state,day,new Date('2026-11-07T06:00:00Z')).at(-1).endMin,1383);
  assert.deepEqual(state,before);
});
test('only verified signed midnight prefix matches the inspection carry; stale or unsigned evidence cannot fill time',()=>{
  const state=fixture({signed:false}), prior='2026-11-05';
  state.eventsByDay[prior]=[{id:'prior',status:'SB',startMin:0,endMin:1440,city:'Prior City',state:'OH'}];
  state.signatureByDay[prior]=createCertificationRecord(state,prior,{now:at.getTime()});
  state.eventsByDay[day]=[{id:'today',status:'ON',startMin:60,endMin:1440,city:'Current City',state:'IL'}];
  assert.equal(recordedCoverage(state,day,at).gaps.length,0);
  assert.equal(buildDotOfficerCheck(state,day).rawCoverageResult.issues.length,0);
  assert.equal(recordedDayView(state,day)[0].city,'PRIOR CITY');
  state.signatureByDay[prior].certifiedContent.events[0].endMin=1383;
  assert.deepEqual(recordedCoverage(state,day,at).gaps,[{startMin:0,endMin:60}]);
  delete state.signatureByDay[prior];
  assert.deepEqual(recordedCoverage(state,day,at).gaps,[{startMin:0,endMin:60}]);
});
test('view and certification never rewrite locations, mileage, unrelated dates or historical attestations',()=>{
  const state=fixture();state.eventsByDay['2026-11-07']=[{id:'other',status:'D',startMin:0,endMin:60}];
  state.eventsByDay[day][5].city='Old carried location';state.eventsByDay[day][7].manualMiles=213.12;
  const before=structuredClone(state);
  visible(state);validateLogForSigning(state,day);buildDayBackupPayload(state,day);captureInspection(state,at);
  assert.deepEqual(state,before);
});
