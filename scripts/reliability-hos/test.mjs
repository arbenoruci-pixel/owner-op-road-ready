import assert from 'node:assert/strict';
import {calculateReliableHos,reviewReliableHos,clocksAt,splitPlans,cyclePolicy,previewHosImpact} from './rules.js';
import {buildEvidenceTimeline} from './timeline.js';
import {previewTimeZoneChange,applyTimeZoneChange,effectiveZone,zoneForLogDay,wallMinute,wallMinuteCandidates,logDayBounds} from './timePolicy.js';
import {hosProfileAt,previewHosProfile,saveHosProfile} from './profile.js';
let passed=0;
const test=(name,run)=>{run();passed++;console.log('PASS — '+name);};
const e=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,source:'manual',city:'Synthetic',state:'IL',...extra});
const state=(eventsByDay,currentStatus='OFF',extra={})=>({eventsByDay,currentStatus,homeTerminalTimeZone:'America/Chicago',hosSettings:{cycleHours:70,cycleDays:8,jurisdiction:'US_INTERSTATE_PROPERTY',splitSleeperEnabled:true,source:'Synthetic carrier policy',confirmedAt:'2026-01-01T00:00:00Z'},...extra});
const now=s=>new Date(s);
const absolute=(status,startAbs,endAbs)=>({status,startAbs,endAbs});
const noChange=(input,run)=>{const before=JSON.stringify(input),result=run();assert.equal(JSON.stringify(input),before,'read must preserve source');return result;};

test('cycle clock and historical ranges agree after old duty days recapture',()=>{
  const days={};for(let d=1;d<=10;d++){const day=`2026-10-${String(d).padStart(2,'0')}`;days[day]=[e(`work${d}`,d===10?'D':'ON',0,480),e(`rest${d}`,'SB',480,1440)];}
  const input=state(days,'SB'),at=now('2026-10-10T13:00:00Z');
  const h=noChange(input,()=>calculateReliableHos(input,at));
  assert.equal(h.cycle.usedMinutes,3840);assert.equal(h.cycle.remainingMinutes,360);
  const review=reviewReliableHos(days,'2026-10-10',{}, {state:input,now:at});
  assert.equal(review.violationRanges.filter(r=>/^cycle/.test(r.type)).length,0);
  const mid=calculateReliableHos(state(days,'D'),now('2026-10-10T09:00:00Z'));
  assert.equal(mid.cycle.usedMinutes,3600,'current duty day plus seven preceding duty days');
});
test('ON counts toward cycle without independently creating a driving violation',()=>{
  const days={};for(let d=1;d<=7;d++){const day=`2026-10-${String(d).padStart(2,'0')}`;days[day]=[e(`on${d}`,'ON',0,600),e(`off${d}`,'OFF',600,1440)];}
  days['2026-10-08']=[e('only-on','ON',0,60),e('off8','OFF',60,1440)];
  const input=state(days,'OFF'),at=now('2026-10-08T06:00:00Z');
  assert.equal(calculateReliableHos(input,at).cycle.remainingMinutes,0);
  assert.equal(reviewReliableHos(days,'2026-10-08',{}, {state:input,now:at}).violationRanges.filter(r=>/^cycle/.test(r.type)).length,0);
});
test('actual Driving after a 60/7 limit is retained at the exact minute',()=>{
  const days={};for(let d=1;d<=6;d++){const day=`2026-10-${String(d).padStart(2,'0')}`;days[day]=[e(`on${d}`,'ON',0,600),e(`off${d}`,'OFF',600,1440)];}
  days['2026-10-07']=[e('drive','D',0,60)];
  const input=state(days,'D',{hosSettings:{cycleHours:60,cycleDays:7,jurisdiction:'US_INTERSTATE_PROPERTY',splitSleeperEnabled:true,source:'Synthetic carrier policy',confirmedAt:'2026-01-01T00:00:00Z'}}),at=now('2026-10-07T06:00:00Z');
  const ranges=reviewReliableHos(days,'2026-10-07',{}, {state:input,now:at}).violationRanges.filter(r=>r.type==='cycle60');
  assert.equal(ranges.length,1);assert.equal(ranges[0].startMin,0);assert.equal(ranges[0].endMin,60);
});

const splitDays={
  '2026-10-16':[e('full-rest','OFF',0,1440)],
  '2026-10-17':[e('prefix','OFF',0,300),e('on','ON',300,480),e('drive-a','D',480,720),e('short','OFF',720,900),e('drive-b','D',900,1260),e('long-a','SB',1260,1440)],
  '2026-10-18':[e('long-b','SB',0,300),e('drive-c','D',300,360)]
};
test('pending hours and completed overnight partner agree with yesterday review',()=>{
  const days=structuredClone(splitDays);delete days['2026-10-18'];
  const h=calculateReliableHos(state(days,'SB'),now('2026-10-18T02:00:00Z'));
  assert.equal(h.splitSleeper.mode,'pending');assert.equal(h.effectiveDrive.remainingMinutes,60);assert.ok(h.warnings.some(w=>w.type==='splitPending'));
  const input=state(splitDays,'D'),at=now('2026-10-18T11:00:00Z');
  const after=noChange(input,()=>calculateReliableHos(input,at));
  assert.equal(after.splitSleeper.complete,true);
  const review=reviewReliableHos(splitDays,'2026-10-17',{}, {state:input,now:at});
  assert.equal(review.violationRanges.filter(r=>r.type==='window14').length,0);
});
test('3h OFF plus 10h SB validates prior driving while full reset maximizes current hours',()=>{
  const days=structuredClone(splitDays);days['2026-10-18']=[e('long-b','SB',0,420),e('drive-c','D',420,480)];
  const input=state(days,'D'),at=now('2026-10-18T13:00:00Z');
  const h=calculateReliableHos(input,at);assert.equal(h.drive.remainingMinutes,600);assert.equal(h.shift.remainingMinutes,780);
  assert.equal(reviewReliableHos(days,'2026-10-17',{}, {state:input,now:at}).violationRanges.filter(r=>r.type==='window14').length,0);
});
test('10h SB can pair with a later 2h OFF, without a conditional partner label',()=>{
  const timeline=[absolute('SB',0,600),absolute('ON',600,720),absolute('D',720,1080),absolute('OFF',1080,1200),absolute('D',1200,1380)];
  const h=clocksAt(timeline,1380,{homeTerminalTimeZone:'UTC',hosSettings:{cycleHours:70,cycleDays:8}});
  assert.equal(h.splitSleeper.complete,true);assert.equal(h.drive.remainingMinutes,120);assert.equal(h.shift.remainingMinutes,180);
});
test('repeated 8/2 pairs carry their valid recalculation context forward',()=>{
  const rows=[absolute('SB',0,600),absolute('D',600,840),absolute('SB',840,1320),absolute('D',1320,1560),absolute('OFF',1560,1680),absolute('D',1680,1920),absolute('SB',1920,2400),absolute('D',2400,2640),absolute('OFF',2640,2760),absolute('D',2760,2820)];
  const h=clocksAt(rows,2820,{homeTerminalTimeZone:'UTC',hosSettings:{cycleHours:70,cycleDays:8}});
  assert.equal(h.splitSleeper.complete,true);assert.equal(h.drive.usedMinutes,300);assert.equal(h.drive.remainingMinutes,360);
});
test('short sleeper cannot masquerade as a completed long period',()=>{
  const rows=[absolute('SB',0,600),absolute('D',600,900),absolute('OFF',900,1080),absolute('D',1080,1260),absolute('SB',1260,1679)];
  assert.equal(splitPlans(rows,1679).pairs.some(p=>p.first.startAbs===900&&p.second.startAbs===1260),false);
});
test('explicit 9h59 rest does not gain a reset across an unknown 61-minute gap',()=>{
  const days={'2026-10-18':[e('ended','SB',0,599,{paperLogEndV110315:true}),e('drive','D',660,720)]};
  const input=state(days,'D'),h=noChange(input,()=>calculateReliableHos(input,now('2026-10-18T17:00:00Z')));
  assert.equal(h.reset.fullReset,null);assert.equal(h.timeline[0].endAbs-h.timeline[0].startAbs,599);
  assert.equal(h.quality.confirmed,false);assert.equal(h.effectiveDrive.requiresReview,true);assert.ok(h.quality.issues.some(i=>i.code==='gap'));
});
test('recorded overlaps stay visible as quality evidence',()=>{
  const input=state({'2026-10-18':[e('a','ON',0,90),e('b','D',60,120)]},'D');
  const h=calculateReliableHos(input,now('2026-10-18T07:00:00Z'));
  assert.ok(h.quality.issues.some(i=>i.code==='overlap'));assert.equal(h.timeline[0].endMin,90);
});
test('a missing SB-to-OFF transition cannot manufacture a qualifying sleeper period',()=>{
  const input=state({'2026-10-17':[e('last-sb','SB',1260,1440)]},'OFF');
  const h=calculateReliableHos(input,now('2026-10-18T09:00:00Z'));
  assert.equal(h.timeline[0].endAbs-h.timeline[0].startAbs,180);
  assert.ok(h.quality.issues.some(i=>i.code==='open_gap'));
  assert.equal(h.effectiveDrive.requiresReview,true);
});
test('true 11h driving violation survives a later 10h rest',()=>{
  const days={'2026-10-17':[e('d1','D',0,480),e('break','ON',480,510),e('d2','D',510,750),e('rest','SB',750,1440)]};
  const input=state(days,'SB'),at=now('2026-10-18T05:00:00Z');
  const ranges=reviewReliableHos(days,'2026-10-17',{}, {state:input,now:at}).violationRanges.filter(r=>r.type==='drive11');
  assert.equal(ranges.length,1);assert.equal(ranges[0].startMin,690);assert.equal(ranges[0].endMin,750);
});
test('break counts 30 continuous non-driving minutes across ON and OFF',()=>{
  const rows=[absolute('D',0,480),absolute('ON',480,495),absolute('OFF',495,510),absolute('D',510,570)];
  assert.equal(clocksAt(rows,570,{homeTerminalTimeZone:'UTC'}).break.usedMinutes,60);
  const withGap=[absolute('D',0,480),absolute('ON',480,495),absolute('OFF',500,515),absolute('D',515,575)];
  assert.equal(clocksAt(withGap,575,{homeTerminalTimeZone:'UTC'}).break.usedMinutes,540);
});
test('continuous 34h restart clears the cycle',()=>{
  const rows=[absolute('ON',0,4200),absolute('SB',4200,6240)];
  assert.equal(clocksAt(rows,6240,{homeTerminalTimeZone:'UTC'}).cycle.usedMinutes,0);
});
test('configured duty-day start does not recapture at device midnight',()=>{
  assert.equal(cyclePolicy({hosSettings:{cycleHours:60,cycleDays:7,dutyDayStartMinute:360}}).dayStartMinute,360);
  const rows=[absolute('ON',Date.parse('2026-10-01T12:00:00Z')/60000,Date.parse('2026-10-01T18:00:00Z')/60000)];
  const input={homeTerminalTimeZone:'America/Chicago',hosSettings:{cycleHours:60,cycleDays:7,dutyDayStartMinute:360}};
  const early=clocksAt(rows,Date.parse('2026-10-08T10:00:00Z')/60000,input),late=clocksAt(rows,Date.parse('2026-10-08T11:00:00Z')/60000,input);
  assert.equal(early.cycle.usedMinutes,360);assert.equal(late.cycle.usedMinutes,0);
});
test('spring DST counts elapsed rest, without inventing the missing hour',()=>{
  const input=state({'2026-03-08':[e('rest','SB',0,600),e('work','ON',600,660)]},'ON');
  const h=calculateReliableHos(input,now('2026-03-08T16:00:00Z'));
  assert.equal(h.timeline[0].endAbs-h.timeline[0].startAbs,540);assert.equal(h.reset.fullReset,null);
});
test('fall DST counts an extra elapsed hour when boundaries are unambiguous',()=>{
  const input=state({'2026-11-01':[e('rest','SB',0,540),e('work','ON',540,600)]},'ON');
  const h=calculateReliableHos(input,now('2026-11-01T16:00:00Z'));
  assert.equal(h.timeline[0].endAbs-h.timeline[0].startAbs,600);assert.ok(h.reset.fullReset);
});
test('repeated and nonexistent DST minutes require evidence',()=>{
  assert.equal(wallMinuteCandidates('2026-11-01',90,'America/Chicago').length,2);
  assert.equal(wallMinute('2026-11-01',90,'America/Chicago').value,null);
  assert.equal(wallMinute('2026-11-01',90,'America/Chicago',{fold:1}).value-wallMinute('2026-11-01',90,'America/Chicago',{fold:0}).value,60);
  assert.equal(wallMinute('2026-03-08',150,'America/Chicago').issue,'dst_missing_minute');
});
test('Chicago proposal retains old ET rows and stays pending until event boundaries are reviewed',()=>{
  const input={homeTerminalTimeZone:'America/New_York',eventsByDay:{'2026-10-12':[e('old','SB',59,887)]},signatureByDay:{'2026-10-12':{signed:true}},logbookEditHistoryByDay:{'2026-10-12':[{kind:'recorded'}]}};
  const at=now('2026-10-19T03:00:00Z'),plan=noChange(input,()=>previewTimeZoneChange(input,'America/Chicago',at));
  assert.equal(plan.effectiveLogDay,'2026-10-19');assert.equal(plan.effectiveAt,'2026-10-19T05:00:00.000Z');assert.equal(plan.transitionMinutes,60);
  const changed=noChange(input,()=>applyTimeZoneChange(input,plan,at)).state;
  assert.deepEqual(changed.eventsByDay,input.eventsByDay);assert.deepEqual(changed.signatureByDay,input.signatureByDay);
  assert.equal(zoneForLogDay(changed,'2026-10-12'),'America/New_York');assert.equal(zoneForLogDay(changed,'2026-10-19'),'America/New_York');
  assert.equal(effectiveZone(changed,at),'America/New_York');assert.equal(effectiveZone(changed,now('2026-10-19T05:00:00Z')),'America/New_York');
  assert.equal(changed.homeTerminalTimeZoneChangeProposal.effectiveAt,null);
  assert.equal(changed.homeTerminalTimeZoneChangeProposal.proposedEffectiveAt,plan.effectiveAt);
  assert.equal(changed.homeTerminalTimeZoneChangeProposal.status,'pending_boundary_review');
  assert.equal(applyTimeZoneChange(changed,plan,at).changed,false,'saving the same proposal is idempotent');
  assert.deepEqual(logDayBounds(changed,'2026-10-12'),logDayBounds(input,'2026-10-12'));
});
test('validated time-zone history resolves historical ET and future Chicago without reinterpreting old days',()=>{
  const input={homeTerminalTimeZone:'America/Chicago',homeTerminalOriginalTimeZone:'America/New_York',homeTerminalTimeZoneHistory:[{previousTimeZone:'America/New_York',timeZone:'America/Chicago',effectiveLogDay:'2026-10-19',effectiveAt:'2026-10-19T05:00:00Z'}]};
  assert.equal(zoneForLogDay(input,'2026-10-12'),'America/New_York');assert.equal(zoneForLogDay(input,'2026-10-19'),'America/Chicago');
  assert.equal(effectiveZone(input,now('2026-10-19T04:00:00Z')),'America/New_York');assert.equal(effectiveZone(input,now('2026-10-19T05:00:00Z')),'America/Chicago');
});
test('a time-zone plan cannot reinterpret an already recorded future day',()=>{
  const input={homeTerminalTimeZone:'America/New_York',eventsByDay:{'2026-10-19':[e('existing','ON',0,60)]}};
  assert.equal(previewTimeZoneChange(input,'America/Chicago',now('2026-10-19T03:00:00Z')).ok,false);
});
test('edit preview reports before/after clocks without changing either state',()=>{
  const a=state({'2026-10-17':[e('rest','SB',0,600),e('drive','D',600,720),e('off','OFF',720,1440)]},'OFF');
  const b=structuredClone(a);b.eventsByDay['2026-10-17'][1].endMin=780;b.eventsByDay['2026-10-17'][2].startMin=780;
  const both=[a,b];const p=noChange(both,()=>previewHosImpact(a,b,'2026-10-17',now('2026-10-18T02:00:00Z')));
  assert.equal(p.clocks.find(x=>x.key==='drive').delta,-60);
});
test('an unconfirmed carrier cycle cannot show affirmative driving availability',()=>{
  const input={homeTerminalTimeZone:'America/Chicago',eventsByDay:{'2026-10-16':[e('reset','SB',0,1440)],'2026-10-17':[e('continued','SB',0,720),e('d','D',720,780)]},currentStatus:'D'};
  const h=calculateReliableHos(input,now('2026-10-17T18:00:00Z'));
  assert.equal(h.effectiveDrive.requiresReview,true);assert.ok(h.quality.issues.some(i=>i.code==='cycle_profile_unconfirmed'));
});
test('unconfirmed rule profiles mark graph violations potential as well as clocks requiring review',()=>{
  const days={'2026-10-16':[e('r','SB',0,1440)],'2026-10-17':[e('d1','D',0,480),e('break','ON',480,510),e('d2','D',510,750)]};
  const input={homeTerminalTimeZone:'America/Chicago',eventsByDay:days,currentStatus:'D'},at=now('2026-10-17T17:30:00Z');
  const review=reviewReliableHos(days,'2026-10-17',{}, {state:input,now:at});
  assert.equal(review.quality.confirmed,false);
  assert.equal(review.violationRanges.some(r=>r.severity==='high'),false);
  assert.ok(review.violationRanges.some(r=>r.potentialType==='drive11'&&r.reviewRequired));
});
test('graph recapture uses the same fixed 24h carrier anchor after DST as the clock',()=>{
  const days={};
  for(let d=2;d<=9;d++){
    const day=`2026-03-${String(d).padStart(2,'0')}`,end=d===2||d===8?600:d===9?360:540;
    days[day]=[e(`on-${d}`,'ON',0,end),e(`off-${d}`,'OFF',end,1440)];
  }
  days['2026-03-10']=[e('drive-after-dst','D',0,120)];
  const input=state(days,'D');input.hosSettings.dutyDayAnchorAt='2026-03-01T06:00:00Z';
  const at=now('2026-03-10T07:00:00Z'),review=reviewReliableHos(days,'2026-03-10',{}, {state:input,now:at});
  const ranges=review.violationRanges.filter(r=>r.type==='cycle70');
  assert.equal(ranges.length,1);assert.equal(ranges[0].startMin,0);assert.equal(ranges[0].endMin,60);
  assert.equal(calculateReliableHos(input,now('2026-03-10T06:00:00Z')).cycle.remainingMinutes,540);
});
test('DST cycle bucket needs a carrier boundary review unless an explicit 24h anchor exists',()=>{
  const at=Date.parse('2026-03-10T17:00:00Z')/60000,rows=[absolute('ON',at-10*1440,at)];
  const base={homeTerminalTimeZone:'America/Chicago',hosSettings:{cycleHours:70,cycleDays:8}};
  assert.equal(clocksAt(rows,at,base).cycle.boundaryIssue,'cycle_boundary_transition');
  const anchored={...base,hosSettings:{...base.hosSettings,dutyDayAnchorAt:'2026-03-01T06:00:00Z'}};
  assert.equal(clocksAt(rows,at,anchored).cycle.boundaryIssue,null);
});
test('a real 14h violation is retained when no split partner can make it compliant',()=>{
  const days={'2026-10-16':[e('rest','OFF',0,1440)],'2026-10-17':[e('off','OFF',0,300),e('on','ON',300,1170),e('d','D',1170,1200),e('later','OFF',1200,1440)]};
  const input=state(days,'OFF'),at=now('2026-10-18T05:00:00Z');
  const r=reviewReliableHos(days,'2026-10-17',{}, {state:input,now:at}).violationRanges.filter(r=>r.type==='window14');
  assert.equal(r.length,1);assert.equal(r[0].startMin,1170);assert.equal(r[0].endMin,1200);
});
test('historical review loads the selected evidence window beyond the live 21-day lookback',()=>{
  const input=state({'2026-05-10':[e('d','D',0,480),e('break','ON',480,510),e('d2','D',510,750),e('rest','OFF',750,1440)]},'OFF');
  const r=reviewReliableHos(input.eventsByDay,'2026-05-10',{}, {state:input,now:now('2026-10-19T17:00:00Z')});
  assert.ok(r.violationRanges.some(r=>r.type==='drive11'&&r.startMin===690));
});
test('carrier profile proposal cannot guess eligibility or overwrite an earlier profile',()=>{
  const input=state({},'OFF'),at=now('2026-10-19T17:00:00Z');
  const unknown=saveHosProfile(input,{},at,false);
  assert.equal(unknown.state.hosProfileProposal.status,'needs_review');assert.equal(unknown.state.hosSettings,input.hosSettings);
  const draft={jurisdiction:'US_INTERSTATE_PROPERTY',carrierOperatesEveryDay:false,dayStartMinute:360,anchorDay:'2026-10-19',splitSleeperEnabled:false,source:'Synthetic verified carrier policy',effectiveLogDay:'2026-10-20'};
  const plan=previewHosProfile(input,draft,at);assert.equal(plan.ok,true);assert.equal(plan.profile.cycleRule,'60/7');
  const result=noChange(input,()=>saveHosProfile(input,draft,at,true));
  assert.equal(result.ok,true);assert.equal(hosProfileAt(result.state,at.getTime()/60000).cycleHours,70);
  assert.equal(hosProfileAt(result.state,Date.parse('2026-10-20T05:00:00Z')/60000).cycleHours,60);
  assert.equal(hosProfileAt(result.state,Date.parse('2026-10-18T05:00:00Z')/60000).splitSleeperEnabled,true);
});
console.log(`${passed} reliability HOS regression groups passed`);
