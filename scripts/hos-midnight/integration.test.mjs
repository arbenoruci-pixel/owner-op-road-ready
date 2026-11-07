import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {analyzeLinkedHos,calculateHosClocks,violationRangesForDay} from '../../source/src/core/hos/hosEngine.js';
import {HOME_TERMINAL_TIMEZONE_STORAGE_KEY} from '../../source/src/core/time/homeTerminalTime.js';
import {overnightFixture,row} from './fixture.js';

const day='2026-11-06',nextDay='2026-11-07';
// Historical APIs read the driver's persisted terminal zone; live clocks read
// the same setting from state. Set both explicitly for these Eastern fixtures.
const originalWindow=globalThis.window;
globalThis.window={localStorage:{getItem:key=>key===HOME_TERMINAL_TIMEZONE_STORAGE_KEY?'America/New_York':null}};
const at=minute=>new Date(Date.UTC(2026,10,6,5,minute));
function stateFor(rows) {
  const eventsByDay={};
  for(const original of rows) {
    for(let offset=Math.floor(original.startAbs/1440);offset*1440<original.endAbs;offset++) {
      const key=new Date(Date.UTC(2026,10,6+offset,12)).toISOString().slice(0,10);
      const {startAbs,endAbs,...value}=original;
      (eventsByDay[key]||=[]).push({...value,startMin:Math.max(0,startAbs-offset*1440),
        endMin:Math.min(1440,endAbs-offset*1440),city:'Example City',state:'IL'});
    }
  }
  return {homeTerminalTimeZone:'America/New_York',activeDay:day,currentStatus:'SB',eventsByDay,
    certifyStatus:{[day]:'Certified'},signatureByDay:{[day]:{signed:true,marker:'fixture-only'}}};
}
function freeze(value) {
  if(value&&typeof value==='object') {Object.freeze(value);for(const child of Object.values(value))freeze(child);}
  return value;
}
mock.timers.enable({apis:['Date'],now:at(1439)});
let passed=0;
function check(name,fn) {fn();passed++;console.log('PASS — '+name);}
try {
  check('live clocks, selected-day review and graph agree before and after midnight',()=>{
    {
      const source='live_status';
      const rows=overnightFixture();rows.at(-1).source=source;
      const state=freeze(stateFor(rows)),before=structuredClone(state);
      for(const minute of [1439,1441,1798,1799,1953]) {
        mock.timers.setTime(at(minute).getTime());
        const live=calculateHosClocks(state,at(minute));
        const review=analyzeLinkedHos(state.eventsByDay,day,state.certifyStatus);
        const ranges=violationRangesForDay(state.eventsByDay,day);
        assert.ok(!ranges.some(r=>r.type==='window14'||r.type==='drive11'),`${source} at ${minute}`);
        assert.ok(!review.warnings.some(w=>w.severity==='high'),`${source} review at ${minute}`);
        if(minute<1799) {
          assert.equal(live.splitSleeper.pending,true);
          assert.equal(review.split?.pending,true);
          assert.equal(live.drive.remainingMinutes,6);
          assert.equal(live.shift.remainingMinutes,62);
        } else assert.equal(review.split?.complete,true);
        if(minute===1798)assert.equal(review.split.partnerRemainingMinutes,1);
        if(minute===1799)assert.equal(live.splitSleeper.complete,true);
      }
      assert.deepEqual(state,before);
    }
  });

  check('actual one-minute driving excess remains in the past-day graph and warning',()=>{
    mock.timers.setTime(at(1806).getTime());
    const state=freeze(stateFor(overnightFixture({extraDrive:7,live:false,restEnd:1806})));
    const ranges=violationRangesForDay(state.eventsByDay,day);
    assert.deepEqual(ranges.filter(r=>r.type==='drive11').map(r=>[r.startMin,r.endMin]),[[1359,1360]]);
    assert.ok(!ranges.some(r=>r.type==='window14'));
    const review=analyzeLinkedHos(state.eventsByDay,day,state.certifyStatus);
    assert.ok(review.warnings.some(w=>w.severity==='high'&&/Drive clock expired/.test(w.text)));
    assert.equal(review.cards.find(card=>card.label==='11h Drive').ok,false);
  });

  check('future end times cannot inflate cycle usage or prematurely complete a rest',()=>{
    mock.timers.setTime(at(720).getTime());
    const work=stateFor([row('reset','SB',0,600),row('work','ON',600,900),row('future-drive','D',900,930)]);
    assert.equal(analyzeLinkedHos(work.eventsByDay,day).cycle.used,120);
    mock.timers.setTime(at(1798).getTime());
    const future=stateFor(overnightFixture({restEnd:2100}));
    future.eventsByDay[nextDay].push({id:'future-duty',status:'D',startMin:660,endMin:670,city:'Example City',state:'IL'});
    const review=analyzeLinkedHos(future.eventsByDay,day);
    assert.equal(review.split?.pending,true);
    assert.equal(review.split.partnerRemainingMinutes,1);
    assert.equal(review.cards.find(card=>card.label==='Reset').value,'Split pending');
  });

  check('a full fourteen-hour work window still blocks subsequent driving',()=>{
    mock.timers.setTime(at(1470).getTime());
    const state=stateFor([row('reset','SB',0,600),row('work','ON',600,1440),row('driving','D',1440,1470)]);
    state.currentStatus='D';state.activeDay=nextDay;
    assert.ok(violationRangesForDay(state.eventsByDay,nextDay).some(r=>r.type==='window14'&&r.startMin===0&&r.endMin===30));
    assert.ok(calculateHosClocks(state,at(1470)).warnings.some(w=>w.severity==='high'));
  });
  console.log(`PASS — ${passed} integrated HOS contracts on the materialized application`);
} finally {
  mock.timers.reset();
  if(originalWindow===undefined)delete globalThis.window;
  else globalThis.window=originalWindow;
}
