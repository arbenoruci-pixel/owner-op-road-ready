import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedDrivingDayView as view} from './drivingDayView.js';
const day='2026-09-17', next='2026-09-18';
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Synthetic city',state:'OH',source:'manual',...extra});
export function fixture(){
  return {activeDay:day,homeTerminalTimeZone:'America/New_York',currentStatus:'D',
    eventsByDay:{[day]:[row('rest','OFF',0,1325),row('drive','D',1325,1326)],
    [next]:[row('bridge','D',0,1,{source:'manual_drive_midnight_continuation',crossMidnightContinuation:true,crossMidnightFromDay:day,crossMidnightFromEventId:'drive'})]},
    manualDrivingSession:{active:true,status:'D',eventId:'bridge',startDay:next},
    signatureByDay:{[day]:{marker:'original attestation'}},logbookEditHistoryByDay:{},routeLegsByDay:{[day]:[{id:'route',bol:'TEST'}]}};
}
const project=(s,clock={day:next,minute:42},d=day)=>view(s.eventsByDay[d],{state:s,eventsByDay:s.eventsByDay,day:d,clock});
test('recorded midnight continuation completes the starting-day Driving line',()=>{
 const s=fixture(),before=structuredClone(s),out=project(s);
 assert.equal(out.at(-1).endMin,1440);assert.equal(out.at(-1).recordedEndMin,1326);assert.equal(out.at(-1).isLive,false);
 assert.equal(out.at(-1).confirmedDrivingContinuationV110372.continuationEventId,'bridge');
 assert.equal(out.slice(0,-1)[0],s.eventsByDay[day][0]);assert.deepEqual(s,before);
 assert.equal(out.reduce((n,e)=>n+e.endMin-e.startMin,0),1440);
});
test('reopening and rereading have identical derived endpoints and leave signatures unchanged',()=>{
 const s=fixture();assert.deepEqual(project(JSON.parse(JSON.stringify(s))),project(s));
 assert.deepEqual(project(s),project(s));assert.deepEqual(s.signatureByDay,{[day]:{marker:'original attestation'}});
});
test('a later stopped session retains historical evidence of crossing midnight',()=>{
 const s=fixture();s.currentStatus='SB';s.manualDrivingSession.active=false;
 s.eventsByDay[next][0].endMin=42;s.eventsByDay[next].push(row('sleep','SB',42,100));
 assert.equal(project(s).at(-1).endMin,1440);
});
test('midnight before rollover is written uses only the exact active origin session',()=>{
 const s=fixture();delete s.eventsByDay[next];s.manualDrivingSession={active:true,status:'D',eventId:'drive',startDay:day};
 assert.equal(project(s).at(-1).endMin,1440);assert.equal(s.eventsByDay[next],undefined,'no new-day row is invented');
 assert.equal(project(s,{day:'2026-09-19',minute:0}),s.eventsByDay[day],'an old session cannot extend arbitrary historical days');
});
test('the current day and its advancing Now projection remain authoritative',()=>{
 const s=fixture(),exact=[...s.eventsByDay[day].slice(0,-1),{...s.eventsByDay[day].at(-1),endMin:1422,isLive:true}];
 assert.equal(view(exact,{state:s,day,clock:{day,minute:1422}}),exact);
 const tomorrowExact=[{...s.eventsByDay[next][0],endMin:42,isLive:true}];
 assert.equal(view(tomorrowExact,{state:s,day:next,clock:{day:next,minute:42}}),tomorrowExact);
});
test('ordinary ended Driving and currentStatus alone never invent elapsed time',()=>{
 const s=fixture();delete s.eventsByDay[next];delete s.manualDrivingSession;
 assert.equal(project(s),s.eventsByDay[day]);
 s.currentStatus='D';s.eventsByDay[day].at(-1).crossMidnightContinues=true;
 assert.equal(project(s),s.eventsByDay[day]);
});
test('explicit live-End edit overrides a surviving midnight link',()=>{
 const s=fixture();s.eventsByDay[day].at(-1).paperLogEndV110315=true;assert.equal(project(s),s.eventsByDay[day]);
});
test('legacy historical end edits remain exact even without the live-End flag',()=>{
 const s=fixture(),after=structuredClone(s.eventsByDay[day]),before=structuredClone(after);before.at(-1).endMin=1440;
 s.logbookEditHistoryByDay[day]=[{kind:'edit',targetId:'drive',beforeEvents:before,afterEvents:after}];
 assert.equal(project(s),s.eventsByDay[day]);
});
test('metadata-only historical edits do not erase a valid continuation',()=>{
 const s=fixture(),after=structuredClone(s.eventsByDay[day]),before=structuredClone(after);before.at(-1).note='old';after.at(-1).note='new';
 s.logbookEditHistoryByDay[day]=[{kind:'edit',targetId:'drive',beforeEvents:before,afterEvents:after}];assert.equal(project(s).at(-1).endMin,1440);
});
test('a separate Driving row after midnight is insufficient without its exact origin link',()=>{
 for(const changes of [{crossMidnightFromEventId:'other'},{crossMidnightFromDay:'2026-09-16'},{crossMidnightContinuation:false},{source:'manual'},{startMin:1,endMin:42},{status:'OFF'}]){
  const s=fixture();Object.assign(s.eventsByDay[next][0],changes);assert.equal(project(s),s.eventsByDay[day],JSON.stringify(changes));
 }
});
test('voided and synthetic continuations cannot complete yesterday',()=>{
 for(const flag of ['voided','syntheticCoverage','displayOnly','carriedFromPreviousDay','synthetic','continuityGenerated']){
  const s=fixture();s.eventsByDay[next][0][flag]=true;assert.equal(project(s),s.eventsByDay[day],flag);
 }
});
test('conflicting midnight prefixes and overlapping records remain unresolved',()=>{
 for(const change of [s=>s.eventsByDay[next].push(row('off','OFF',0,2)),s=>s.eventsByDay[next].push({...s.eventsByDay[next][0]}),s=>s.eventsByDay[day].push(row('later','ON',1326,1340)),s=>s.eventsByDay[day][0].endMin=1327]){
  const s=fixture();change(s);assert.equal(project(s),s.eventsByDay[day]);
 }
});
test('deleted and duplicated origins never reappear or acquire a continuation',()=>{
 const s=fixture(),original=structuredClone(s.eventsByDay[day]);s.eventsByDay[day]=[];assert.equal(view(original,{state:s,day,clock:{day:next}}),original);
 s.eventsByDay[day]=[...original,{...original.at(-1)}];assert.equal(project(s),s.eventsByDay[day]);
});
test('earlier real gaps stay visible while the independently linked final trip continues',()=>{
 const s=fixture();s.eventsByDay[day]=[row('rest','OFF',0,600),row('on','ON',601,1325),s.eventsByDay[day].at(-1)];
 const out=project(s);assert.equal(out[0].endMin,600);assert.equal(out[1].startMin,601);assert.equal(out.at(-1).endMin,1440);
});
test('stopped, mismatched and incomplete sessions cannot stand in for a missing bridge',()=>{
 for(const change of [{active:false},{status:'ON'},{eventId:'other'},{startDay:next},{endedAt:'2026-09-18T03:00:00Z'}]){
  const s=fixture();delete s.eventsByDay[next];s.manualDrivingSession={active:true,status:'D',eventId:'drive',startDay:day,...change};assert.equal(project(s),s.eventsByDay[day]);
 }
});
test('invalid dates, future days and malformed intervals fail closed',()=>{
 const s=fixture();for(const bad of ['2026-02-30','bad','',null])assert.equal(view(s.eventsByDay[day],{state:s,day:bad,clock:{day:next}}),s.eventsByDay[day]);
 assert.equal(project(s,{day:'2026-09-16'}),s.eventsByDay[day]);
 for(const change of [{endMin:1441},{startMin:1325.5},{endMin:1325},{id:''}]){const x=fixture();Object.assign(x.eventsByDay[day].at(-1),change);assert.equal(project(x),x.eventsByDay[day]);}
});
test('calendar adjacency handles month, year and leap-day boundaries without local-time assumptions',()=>{
 for(const [a,b] of [['2026-09-30','2026-10-01'],['2026-12-31','2027-01-01'],['2028-02-28','2028-02-29'],['2028-02-29','2028-03-01']]){
  const s=fixture(),orig=s.eventsByDay[day],bridge=s.eventsByDay[next];bridge[0].crossMidnightFromDay=a;s.eventsByDay={[a]:orig,[b]:bridge};
  assert.equal(project(s,{day:b,minute:42},a).at(-1).endMin,1440);
 }
});
test('a full recorded day is unchanged and no correction is written by repeat projection',()=>{
 const s=fixture();s.eventsByDay[day].at(-1).endMin=1440;assert.equal(project(s),s.eventsByDay[day]);
 const freeze=o=>{Object.freeze(o);for(const v of Object.values(o))if(v&&typeof v==='object'&&!Object.isFrozen(v))freeze(v);};
 const f=fixture();freeze(f);assert.equal(project(f).at(-1).endMin,1440);
});

test('a voided next-day record prevents the pending-rollover fallback',()=>{
 const s=fixture();s.eventsByDay[next][0].voided=true;
 s.manualDrivingSession={active:true,status:'D',eventId:'drive',startDay:day};
 assert.equal(project(s),s.eventsByDay[day]);
});
