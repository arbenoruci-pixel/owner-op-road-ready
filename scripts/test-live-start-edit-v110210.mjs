import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyLogbookEditorEdit as edit, previewLogbookEditorOverride as preview, projectLogbookEvents } from '../source/src/modules/logbook/eventEditingV110.js';

const day='2026-09-07';
const at=new Date('2026-09-07T23:11:00Z'); // 19:11 America/New_York, matching the phone case.
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Hubbard',state:'OH',note:status==='ON'?'Pre-trip inspection · Fuel':status==='D'?'Driving':'Off Duty',source:'manual',...extra});
function state(status='ON',source='live_status'){
  const rows=[row('off','OFF',0,1148),row('live',status,1148,1149,{source,lat:41.15,lng:-80.57,locationSource:'gps'})];
  return {activeDay:day,homeTerminalTimeZone:'America/New_York',eventsByDay:{[day]:rows},currentStatus:status,currentReason:status==='ON'?'Fuel':'Driving',currentLocation:{city:'Hubbard',state:'OH'},certifyStatus:{[day]:'Active day / Not certified yet'},signatureByDay:{},inspectionByDay:{},formByDay:{},routeLegsByDay:{},loadGuidesById:{},dotWallet:{documents:{}},manualDrivingSession:null,gpsTrip:null};
}
function command(s,patch){return {day,id:'live',patch,expected:structuredClone(s.eventsByDay[day].find(e=>e.id==='live')),expectedRows:structuredClone(s.eventsByDay[day])};}
function activeRanges(result){return result.events.filter(e=>!e.voided&&!e.synthetic).map(e=>[e.id,e.status,e.startMin,e.endMin]);}
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS — '+name);}

test('phone case: current ON Start can move backward anywhere before Now',()=>{
  const s=state();
  const p=preview(s,command(s,{startMin:900}),at);
  const r=edit(s,command(s,{startMin:900}),at);
  assert.ok(p.ok);assert.ok(r.ok);
  assert.deepEqual(activeRanges(r),[['off','OFF',0,900],['live','ON',900,1151]]);
  assert.equal(r.state.currentStatus,'ON');
  assert.equal(r.events.find(e=>e.id==='live').source,'live_status');
  assert.equal(r.events.find(e=>e.id==='live').lat,41.15);
  assert.deepEqual(r.events,p.events);
  assert.deepEqual(r.state.logbookEditHistoryByDay[day][0].beforeEvents,s.eventsByDay[day]);
  assert.equal(projectLogbookEvents(r.state,day,new Date('2026-09-07T23:15:00Z')).find(e=>e.id==='live').endMin,1155);
});

test('live Start can move later while End remains Now and previous manual status follows the boundary',()=>{
  const s=state();
  const r=edit(s,command(s,{startMin:1150}),at);
  assert.ok(r.ok);
  assert.deepEqual(activeRanges(r),[['off','OFF',0,1150],['live','ON',1150,1151]]);
});

test('live Start cannot be placed at or after Now',()=>{
  const s=state();
  assert.equal(edit(s,command(s,{startMin:1151}),at).ok,false);
  assert.equal(edit(s,command(s,{startMin:1200}),at).ok,false);
});

test('live End and live duty status remain on the explicit Change status path',()=>{
  const s=state();
  assert.equal(edit(s,command(s,{endMin:1150}),at).ok,false);
  assert.equal(edit(s,command(s,{status:'OFF'}),at).ok,false);
});

test('automatic live Driving timing remains protected',()=>{
  const s=state('D','gps_drive');
  s.gpsTrip={status:'active',eventId:'live'};
  assert.equal(edit(s,command(s,{startMin:900}),at).ok,false);
  const note=edit(s,command(s,{note:'Reviewed GPS Driving'}),at);
  assert.ok(note.ok);
  assert.equal(note.events.find(e=>e.id==='live').startMin,1148);
  assert.equal(note.events.find(e=>e.id==='live').endMin,1149);
});

test('moving live Start cannot overwrite protected automatic Driving earlier in the day',()=>{
  const s=state();
  s.eventsByDay[day]=[row('off','OFF',0,800),row('auto','D',800,900,{source:'gps_drive'}),row('live','ON',900,901,{source:'live_status'})];
  const c={day,id:'live',patch:{startMin:700},expected:structuredClone(s.eventsByDay[day][2]),expectedRows:structuredClone(s.eventsByDay[day])};
  assert.equal(edit(s,c,at).ok,false);
});

test('metadata-only live Save leaves raw timing and current session untouched',()=>{
  const s=state();
  const before=structuredClone(s);
  const r=edit(s,command(s,{note:'Pre-trip inspection · Fuel · waiting'}),at);
  assert.ok(r.ok);
  assert.deepEqual(r.events.map(e=>[e.id,e.startMin,e.endMin]),before.eventsByDay[day].map(e=>[e.id,e.startMin,e.endMin]));
  assert.equal(r.state.currentStatus,before.currentStatus);
  assert.equal(r.state.logbookEditHistoryByDay,undefined);
});

test('final phone UI exposes Start input + one Start handle while End stays Now',()=>{
  const editor=fs.readFileSync('source/src/modules/editor/EditEventSheet.jsx','utf8');
  const time=fs.readFileSync('source/src/modules/editor/components/EditorTimeControlsV110.jsx','utf8');
  const graph=fs.readFileSync('source/src/modules/editor/components/CompactGraphPanelV111.jsx','utf8');
  assert.match(editor,/liveV110 \? \{startMin:preview\.startMin\}/);
  assert.match(editor,/put\('startMin',preview\.startMin,fromInput\(initialForm\.start\)\)/);
  assert.doesNotMatch(time,/value=\{start==='24:00'\?'00:00':start\} disabled=\{live\}/);
  assert.match(time,/<output className="live-now-v110"/);
  assert.match(graph,/selected\?\.isLive \? \['start'\] : \['start','end'\]/);
});

test('release is 110.2.10 and remains non-forced',()=>{
  const meta=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
  assert.equal(meta.version,'110.2.10');assert.equal(meta.build,'v110210-live-start-edit');assert.equal(meta.force,false);
});

console.log(`${passed} live Start edit regression groups passed`);
