import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { applyEditorPatch } from '../source/src/shared/utils/logbookEditorTimeV1102.js';
const source=fs.readFileSync('source/src/app/App.jsx','utf8');
const start=source.indexOf('  function updateEvent('),end=source.indexOf('\n  function ',start+20);
assert.ok(start>0&&end>start);
const day='2026-07-10',other='2026-07-09';
function fixture(note='Driving',status='D'){return {activeDay:day,currentStatus:status,eventsByDay:{[day]:[{id:'test',status,startMin:100,endMin:200,note}],[other]:[{id:'old',status:'OFF',startMin:0,endMin:1440}]},inspectionByDay:{[other]:{complete:true,sourceEventId:'old'}},signatureByDay:{[other]:{signed:true,signedAt:123,certificationHistory:[{signedAt:12}]}},manualDrivingSession:{active:true,eventId:'test'}};}
function run(state,patch,{accept=true,liveId=null}={}){const calls={prompt:0,link:0,reconcile:[]},ctx={state,result:state,window:{alert:()=>assert.fail('Unexpected editor rejection')},applyEditorPatch,liveEventId:()=>liveId,isPreTripStatus:(status,text)=>status==='ON'&&/pre.trip/i.test(text),inspectionActivityText:e=>[e.note,e.description,...(e.reasons||[])].filter(Boolean).join(' '),maybeAcceptInspectionForEvent:()=>{calls.prompt++;return accept;},withAcceptedPreTripInspection:(s,d,e,accepted)=>{calls.link++;return accepted?{...s,inspectionByDay:{...s.inspectionByDay,[d]:{complete:true,sourceEventId:e.id,sourceStartMin:e.startMin,sourceEndMin:e.endMin}}}:s;},reconcilePreTripInspections:(s,days)=>{calls.reconcile.push(...days);return s;},markDayRecert:(s,d)=>({...s,changedDay:d})};ctx.setState=fn=>ctx.result=fn(ctx.result);vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'\nthis.updateEvent=updateEvent;',ctx);ctx.updateEvent('test',patch,{day,event:structuredClone(state.eventsByDay[day][0])});return {state:ctx.result,calls};}
{
 const before=fixture(),out=run(before,{note:'Gate note'},{liveId:'test'});
 assert.equal(out.calls.prompt,0);assert.deepEqual(out.calls.reconcile,[]);assert.deepEqual(out.state.inspectionByDay,before.inspectionByDay);assert.deepEqual(out.state.manualDrivingSession,before.manualDrivingSession);assert.equal(out.state.eventsByDay[day][0].endMin,200);
 console.log('PASS — live note-only edit never changes inspection records or session');
}
{
 const before=fixture('Waiting','ON'),out=run(before,{note:'Pre-trip inspection',reasons:['Pre-trip inspection']});
 assert.equal(out.calls.prompt,1);assert.deepEqual(out.calls.reconcile,[day]);assert.equal(out.state.inspectionByDay[day].complete,true);assert.equal(out.state.inspectionByDay[day].sourceEventId,'test');assert.deepEqual(out.state.inspectionByDay[other],before.inspectionByDay[other]);assert.deepEqual(out.state.signatureByDay,before.signatureByDay);assert.deepEqual(out.state.eventsByDay[other],before.eventsByDay[other]);
 console.log('PASS — explicit pre-trip choice retains consent and exact event linkage');
 console.log('PASS — inspection action leaves other days and certification history unchanged');
}
{
 const before=fixture('Waiting','ON'),out=run(before,{note:'Pre-trip inspection'},{accept:false});assert.equal(out.calls.prompt,1);assert.equal(out.state.inspectionByDay[day],undefined);
 console.log('PASS — declining inspection consent does not certify an inspection');
}
{
 const before=fixture('Pre-trip inspection','ON');before.inspectionByDay[day]={complete:true,sourceEventId:'test'};
 const out=run(before,{endMin:205},{accept:false});assert.deepEqual(out.calls.reconcile,[day]);assert.equal(out.state.eventsByDay[day][0].endMin,205);
 console.log('PASS — edited inspection event uses existing single-day reconciliation');
}
