import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateSplitSleeperReview,observedHosTimeline,reviewSplitHosRanges} from './core.js';
import {overnightFixture,row,range} from './fixture.js';

const review=(rows,now,rs=[range('window14',1261,1353)],end=1440)=>reviewSplitHosRanges(rs,rows,
  {dayStartAbs:0,dayEndAbs:end,nowAbs:now});

test('pending split retains the same ranges across midnight without a new-day row',()=>{
  const rows=overnightFixture();
  const during=review(rows,1352,[range('window14',1261,1352)],1352);
  assert.deepEqual(during.ranges,[]);
  assert.equal(during.split.pending,true);
  assert.equal(during.split.partnerRemainingMinutes,446);
  const before=review(rows,1439,undefined,1439),after=review(rows,1441);
  assert.deepEqual(before.ranges,[]);assert.deepEqual(after.ranges,[]);
  assert.equal(after.split.pending,true);assert.equal(after.split.partnerRemainingMinutes,358);
  const manual=overnightFixture();manual.at(-1).source='manual';
  assert.equal(observedHosTimeline(manual,1441).at(-1).endAbs,1383,'manual tail remains bounded');
});

test('2h34 requires7h26 SB: one minute short is pending and exact completion resolves history',()=>{
  const rows=overnightFixture();
  assert.equal(review(rows,1798).split.partnerRemainingMinutes,1);
  assert.equal(review(rows,1798).split.pending,true);
  const exact=review(rows,1799);
  assert.equal(exact.split.complete,true);assert.deepEqual(exact.ranges,[]);
  assert.equal(exact.split.driveUsedMinutes,552);
  assert.equal(exact.split.shiftUsedMinutes,597);
});

test('a completed historical split survives10h rest and subsequent work; live may use the newer reset',()=>{
  const rows=overnightFixture({live:false,restEnd:1953});
  rows.push(row('next-work','ON',1953,1968),row('next-drive','D',1968,2028));
  assert.deepEqual(review(rows,2028).ranges,[]);
  assert.equal(review(rows,2028).split.complete,true);
  const live=evaluateSplitSleeperReview(rows,2028);
  assert.equal(live.available,false,'newer full reset dominates the old split for current clocks');
});

test('a preceding10h sleeper can pair with a later2h rest under FAQ22',()=>{
  const rows=[row('reset','SB',-600,0),row('work','ON',0,240),row('drive','D',240,600),
    row('short','OFF',600,720),row('late-drive','D',720,960)];
  const result=reviewSplitHosRanges([range('window14',840,960)],rows,
    {dayStartAbs:0,dayEndAbs:1440,nowAbs:960});
  assert.deepEqual(result.ranges,[]);assert.equal(result.split.complete,true);
});

test('real11h excess remains exact while the valid split removes an unrelated14h range',()=>{
  const rows=overnightFixture({extraDrive:7,live:false,restEnd:1806});
  const result=review(rows,1806,[range('window14',1261,1360),range('drive11',1359,1360)]);
  assert.deepEqual(result.ranges,[range('drive11',1359,1360)]);
});

test('a real one-minute14h excess around the first rest remains after completion',()=>{
  const rows=[row('reset','SB',0,600),row('work','ON',600,900),row('short','OFF',900,1080),
    row('drive','D',1080,1621),row('long','SB',1621,2041)];
  const result=reviewSplitHosRanges([range('window14',1440,1621)],rows,
    {dayStartAbs:0,dayEndAbs:2041,nowAbs:2041});
  assert.deepEqual(result.ranges.map(r=>[r.type,r.startMin,r.endMin]),[['window14',1620,1621]]);
});

test('earlier true violations survive while later completed split recalculates subsequent driving',()=>{
  const rows=[row('reset','SB',0,600),row('early-drive','D',600,1261),row('short','OFF',1261,1441),
    row('between','D',1441,1501),row('long','SB',1501,1921),row('after','D',1921,1981)];
  const before=range('drive11',1260,1261),between=range('drive11',1441,1501);
  const result=reviewSplitHosRanges([before,between,range('drive11',1921,1981)],rows,
    {dayStartAbs:0,dayEndAbs:2100,nowAbs:1981});
  assert.deepEqual(result.ranges,[before,between]);
});

test('rolling7h/3h/7h pair uses the preceding pair context',()=>{
  const rows=[row('reset','SB',-600,0),row('work','ON',0,60),row('a','D',60,360),
    row('long-a','SB',360,780),row('b','D',780,1080),row('short','OFF',1080,1260),
    row('c','D',1260,1620),row('long-b','SB',1620,2040)];
  const result=reviewSplitHosRanges([range('drive11',1320,1620),range('window14',1260,1620)],rows,
    {dayStartAbs:0,dayEndAbs:1700,nowAbs:2040});
  assert.deepEqual(result.ranges,[]);
});

test('mutually alternative pairings cannot erase each other’s real violations',()=>{
  const rows=[row('work','ON',0,60),row('a','D',60,300),row('rest-a','OFF',300,480),
    row('b','D',480,600),row('work-b','ON',600,700),row('rest-b','OFF',700,820),
    row('work-c','ON',820,980),row('c','D',980,1000),row('long','SB',1000,1480),
    row('later-work','ON',1480,1800),row('later-drive','D',1800,1820),row('off','OFF',1820,1850)];
  const rs=[range('window14',980,1000),range('window14',1800,1820)];
  const result=reviewSplitHosRanges(rs,rows,{dayStartAbs:0,dayEndAbs:1850,nowAbs:1850});
  assert.deepEqual(result.ranges,[rs[0]],'equal-severity alternatives choose the available-time winner and retain its20m violation');
  const earlier=reviewSplitHosRanges([rs[0]],rows,{dayStartAbs:0,dayEndAbs:1440,nowAbs:1850});
  assert.deepEqual(earlier.ranges,[rs[0]],'the same global pairing is used when reviewing the earlier day');
});

test('independent reset-separated histories retain their earlier completed split proofs',()=>{
  const early=overnightFixture({live:false,restEnd:1953});
  const later=[row('next-work','ON',1953,2100),row('next-drive','D',2100,2400),
    row('next-short','OFF',2400,2580),row('next-drive-b','D',2580,2850),row('next-long','SB',2850,3270)];
  const result=review([...early,...later],3270);
  assert.deepEqual(result.ranges,[],'a later10h reset and new split must not undo earlier history');
});

test('unfinished partners remain provisional when later elapsed time contains no driving',()=>{
  const abandoned=overnightFixture({live:false,restEnd:1500});
  abandoned.push(row('resumed-work','ON',1500,1800));
  const ended=review(abandoned,1800);
  assert.deepEqual(ended.ranges,[]);assert.equal(ended.split.pending,true);
  assert.equal(ended.split.partnerRemainingMinutes,446,'an ended attempt gives no credit toward the next partner');
  const off=overnightFixture();off.at(-1).status='OFF';
  const offOnly=review(off,1799);
  assert.deepEqual(offOnly.ranges,[]);assert.equal(offOnly.split.pending,true);
  assert.equal(offOnly.split.partnerRemainingMinutes,446,'OFF-only time cannot complete the required long sleeper');
  const interrupted=overnightFixture({live:false,restEnd:1563});
  interrupted.push(row('one-minute-work','ON',1563,1564),row('later-sb','SB',1564,1799));
  const restarted=review(interrupted,1799);
  assert.deepEqual(restarted.ranges,[]);assert.equal(restarted.split.pending,true);
  assert.equal(restarted.split.partnerProgressMinutes,235);
  assert.equal(restarted.split.partnerRemainingMinutes,211,'one minute of ON breaks sleeper continuity');
});

test('actual later driving beyond the conditional window keeps the real violation',()=>{
  for(const kind of ['ended','off-only','interrupted']) {
    const rows=overnightFixture({live:false,restEnd:1798});
    if(kind==='off-only')rows.at(-1).status='OFF';
    if(kind==='interrupted') {
      rows.at(-1).endAbs=1563;
      rows.push(row('one-minute-work','ON',1563,1564),row('later-sb','SB',1564,1798));
    }
    rows.push(row('late-drive','D',1798,1799));
    const actual=range('window14',1798,1799);
    const result=review(rows,1799,[range('window14',1261,1353),actual],1799);
    assert.ok(result.ranges.some(r=>r.type==='window14'&&r.startMin===1798&&r.endMin===1799),kind);
    assert.equal(result.pending.length,0,kind);
  }
});

test('05:58 interrupted sleeper then ON preserves earlier pending review with zero current shift allowance',()=>{
  const rows=overnightFixture({live:false,restEnd:1798});
  rows.push(row('on-after-short-sleeper','ON',1798,1799));
  const before=structuredClone(rows);
  const provisional=review(rows,1799),live=evaluateSplitSleeperReview(rows,1799);
  assert.deepEqual(provisional.ranges,[]);assert.equal(provisional.split.pending,true);
  assert.equal(live.pending,true);assert.equal(live.partnerRemainingMinutes,446);
  assert.equal(live.shiftUsedMinutes,1224);assert.equal(live.shiftExpired,true);
  assert.equal(live.shiftRemainingMinutes,0);assert.equal(live.driveRemainingMinutes,6);
  assert.deepEqual(rows,before);
  const future=[...rows,row('new-qualifying-sleeper','SB',1799,2245)];
  const oneShort=review(future,2244),complete=review(future,2245);
  assert.equal(oneShort.split.pending,true);assert.equal(oneShort.split.partnerRemainingMinutes,1);
  assert.deepEqual(oneShort.ranges,[]);assert.equal(complete.split.complete,true);
  assert.deepEqual(complete.ranges,[],'a later actual partner confirms the same earlier driving');
});

test('an interrupted attempt may still await a later partner while combined clocks are feasible',()=>{
  const rows=[row('reset','OFF',-600,0),row('drive-a','D',0,120),row('short','OFF',120,300),
    row('drive-b','D',300,420),row('incomplete','SB',420,480),row('work','ON',480,490)];
  const split=evaluateSplitSleeperReview(rows,490);
  assert.equal(split.pending,true);assert.equal(split.partnerRemainingMinutes,420);
});

test('future rows and oversized current end times cannot complete unelapsed rest',()=>{
  const rows=overnightFixture({restEnd:2100});
  rows.push(row('future-reset','SB',5000,6000));
  const result=review(rows,1500);
  assert.equal(result.split.pending,true);assert.equal(result.split.partnerRemainingMinutes,299);
  assert.ok(observedHosTimeline(rows,1500).every(e=>e.endAbs<=1500&&e.startAbs<1500));
  assert.equal(evaluateSplitSleeperReview(rows,6000,{observedUntilAbs:1500}).complete,false);
});

test('a closed old rest cannot remain pending forever or silently fill missing days',()=>{
  const rows=overnightFixture({live:false});
  const result=review(rows,5000);
  assert.equal(result.split.pending,false);assert.ok(result.ranges.length>0);
});

test('independent violations and all input evidence remain unchanged',()=>{
  const rows=overnightFixture(),snapshot=structuredClone(rows);
  const independent=[range('break8',1200,1230),range('cycle70',1100,1200),
    range('overlap',700,710),range('statusReason',466,529)];
  const rs=[range('window14',1261,1353),...independent],before=structuredClone(rs);
  const result=review(rows,1799,rs);
  assert.deepEqual(result.ranges,independent);
  for(let i=0;i<independent.length;i++)assert.equal(result.ranges[i],independent[i]);
  assert.deepEqual(rows,snapshot);assert.deepEqual(rs,before);
});
