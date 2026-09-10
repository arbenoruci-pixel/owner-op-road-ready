import assert from 'node:assert/strict';
import {applyLogbookEditorEdit as edit,applyLogbookEditorInsert as insert,previewLogbookEditorOverride as preview,projectLogbookEvents as project} from '../source/src/modules/logbook/eventEditingV110.js';
const day='2026-09-09',at=new Date('2026-09-10T03:55:00Z'),later=new Date('2026-09-10T04:00:00Z');
const row=(id,status,startMin,endMin,source='manual')=>({id,status,startMin,endMin,source,note:'Keep '+id,lat:41,lng:-71});
function fixture(){return {activeDay:day,homeTerminalTimeZone:'America/New_York',currentStatus:'SB',eventsByDay:{[day]:[row('early','D',0,25),row('sleep','SB',25,750),row('pti','ON',750,778),row('target','D',778,1321,'gps_drive'),row('live','SB',1321,1322,'live_status')]},signatureByDay:{'2026-09-08':{signed:true}},routeLegsByDay:{[day]:[{id:'route',eventId:'target'}]},loadGuidesById:{guide:{route:'Keep'}}};}
const command=(s,id,patch)=>({day,id,patch,expected:structuredClone(s.eventsByDay[day].find(e=>e.id===id)),expectedRows:structuredClone(s.eventsByDay[day])});
let count=0;function test(name,fn){fn();count++;console.log('PASS — '+name);}
test('Exact phone case: Driving 12:58–22:01 becomes 12:58–18:01 and current SB moves to 18:01',()=>{
 const s=fixture(),before=structuredClone(s),cmd=command(s,'target',{endMin:1081}),p=preview(s,cmd,at),r=edit(s,cmd,at);
 assert.equal(r.ok,true,r.error);assert.deepEqual(p.events,r.events);assert.deepEqual(s,before);
 assert.equal(r.events.find(e=>e.id==='target').endMin,1081);assert.equal(r.events.find(e=>e.id==='live').startMin,1081);
 for(const key of ['signatureByDay','routeLegsByDay','loadGuidesById','currentStatus'])assert.deepEqual(r.state[key],s[key]);
 assert.deepEqual(r.events.slice(0,3),s.eventsByDay[day].slice(0,3));
 const reopened=JSON.parse(JSON.stringify(r.state));assert.equal(project(reopened,day,at).find(e=>e.id==='target').endMin,1081);
 const again=edit(reopened,command(reopened,'target',{endMin:1201}),at);assert.equal(again.ok,true,again.error);assert.equal(again.events.find(e=>e.id==='live').startMin,1201);
});
for(const source of ['manual','gps_drive','eld','vehicle_gateway'])test(source+' tagged Driving supports Start, End, status and overlapping Insert',()=>{
 const s=fixture();s.eventsByDay[day][3].source=source;s.eventsByDay[day][3].autoRecorded=true;
 for(const patch of [{startMin:770},{endMin:1350},{status:'OFF'}]){const r=edit(s,command(s,'target',patch),at);assert.equal(r.ok,true,r.error);}
 const r=insert(s,{day,event:row('new','ON',800,830)},at);assert.equal(r.ok,true,r.error);assert.ok(r.events.some(e=>e.id==='new'));
});
for(const status of ['OFF','SB','ON','D'])test('Current '+status+' accepts End, status, Start and Insert',()=>{
 const s=fixture();s.currentStatus=status;s.eventsByDay[day][4].status=status;
 if(status==='D')s.manualDrivingSession={active:true,eventId:'live',startDay:day};
 const r=edit(s,command(s,'live',{endMin:1400}),at);assert.equal(r.ok,true,r.error);assert.equal(r.events.find(e=>e.id==='live').paperLogEndV110315,true);
 assert.equal(project(JSON.parse(JSON.stringify(r.state)),day,at).find(e=>e.id==='live').endMin,1400);
 if(status==='D')assert.equal(r.state.manualDrivingSession.active,false);
 const st=edit(s,command(s,'live',{status:status==='ON'?'SB':'ON'}),at);assert.equal(st.ok,true,st.error);assert.equal(st.state.currentStatus,status==='ON'?'SB':'ON');
 const start=edit(s,command(s,'live',{startMin:1300}),at);assert.equal(start.ok,true,start.error);
 for(const [a,b] of [[1420,1435],[1420,1439]]) {const ins=insert(s,{day,event:row('new','ON',a,b)},at);assert.equal(ins.ok,true,ins.error);assert.equal(ins.state.currentStatus,status);assert.equal(ins.events.find(e=>e.id==='live').startMin,b);}
});
test('Explicit End equal to the raw sentinel closes the current event',()=>{const s=fixture(),r=edit(s,command(s,'live',{endMin:1322}),at);assert.equal(r.ok,true,r.error);assert.equal(r.events.find(e=>e.id==='live').paperLogEndV110315,true);});
test('Note-only editing preserves exact raw rows and active session',()=>{const s=fixture();s.currentStatus='D';s.eventsByDay[day][4].status='D';s.manualDrivingSession={active:true,eventId:'live',startDay:day};const r=edit(s,command(s,'live',{note:'Changed'}),at);assert.equal(r.ok,true);assert.deepEqual(r.events,s.eventsByDay[day].map(e=>e.id==='live'?{...e,note:'Changed'}:e));assert.deepEqual(r.state.manualDrivingSession,s.manualDrivingSession);});
test('Invalid intervals and stale snapshots do not overwrite another edit',()=>{const s=fixture(),c=command(s,'target',{endMin:1081});s.eventsByDay[day][3].note='Newer';assert.equal(edit(s,c,at).ok,false);assert.equal(edit(s,command(s,'target',{endMin:100}),at).ok,false);});
console.log(`${count} paper-log editing regression groups passed`);
