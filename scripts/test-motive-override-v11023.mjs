import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyLogbookEditorEdit, previewLogbookEditorOverride } from '../source/src/modules/logbook/eventEditingV110.js';
const day='2026-09-06';
const at=new Date('2026-09-06T21:00:00Z');
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Willowbrook',state:'IL',source:'manual',...extra});
const stateFor=rows=>({activeDay:day,homeTerminalTimeZone:'America/New_York',eventsByDay:{[day]:rows},certifyStatus:{[day]:'Needs signature'},currentStatus:'OFF'});
{
 const rows=[row('off1','OFF',0,600),row('on','ON',600,660),row('off2','OFF',660,900),row('sb','SB',900,1200)];
 const s=stateFor(rows),r=applyLogbookEditorEdit(s,{day,id:'on',expected:rows[1],patch:{endMin:750}},at);
 assert.equal(r.ok,true);assert.deepEqual(r.state.eventsByDay[day].map(e=>[e.id,e.startMin,e.endMin]),[['off1',0,600],['on',600,750],['off2',750,900],['sb',900,1200]]);assert.equal(r.timelineChanged,true);
 console.log('PASS — expanding END trims the next manual event and leaves a connected boundary');
}
{
 const rows=[row('off','OFF',0,1000),row('on','ON',1000,1060),row('rest','OFF',1060,1440)];
 const s=stateFor(rows),r=applyLogbookEditorEdit(s,{day,id:'on',expected:rows[1],patch:{startMin:300,endMin:400}},at);
 assert.equal(r.ok,true);const out=r.state.eventsByDay[day];
 assert.deepEqual(out.map(e=>[e.status,e.startMin,e.endMin]),[['OFF',0,300],['ON',300,400],['OFF',400,1000],['OFF',1000,1440]]);
 assert.equal(out[2].id.startsWith('off__split_on_400'),true);
 console.log('PASS — placing an event inside another manual event splits the covered event around it');
}
{
 const rows=[row('off1','OFF',0,600),row('on','ON',600,780),row('off2','OFF',780,1200)];
 const s=stateFor(rows),r=applyLogbookEditorEdit(s,{day,id:'on',expected:rows[1],patch:{endMin:700}},at);
 assert.equal(r.ok,true);assert.deepEqual(r.state.eventsByDay[day].map(e=>[e.id,e.startMin,e.endMin]),[['off1',0,600],['on',600,700],['off2',700,1200]]);
 console.log('PASS — shrinking END lets the touching next status take the released time');
}
{
 const rows=[row('off','OFF',0,500),row('on','ON',500,600),row('sb','SB',600,700),row('d','D',700,760,{source:'gps_drive'})];
 const s=stateFor(rows),r=applyLogbookEditorEdit(s,{day,id:'on',expected:rows[1],patch:{endMin:720}},at);
 assert.equal(r.ok,false);assert.match(r.error,/Automatic Driving time cannot be overwritten/);assert.deepEqual(s.eventsByDay[day],rows);
 console.log('PASS — automatic Driving blocks an overlapping manual override');
}
{
 const rows=[row('off','OFF',0,500),row('on','ON',500,600),row('live','OFF',600,601,{source:'live_status'})];
 const s={...stateFor(rows),currentStatus:'OFF'};
 const r=previewLogbookEditorOverride(s,{day,id:'on',expected:rows[1],patch:{endMin:700}},new Date('2026-09-06T16:30:00Z'));
 assert.equal(r.ok,false);assert.match(r.error,/current live event cannot be overwritten/i);
 console.log('PASS — the active live event blocks another event from swallowing its projected time');
}
{
 const rows=[row('off','OFF',0,600),row('on','ON',600,700,{reasons:['Fuel']}),row('rest','OFF',700,1440)];
 const s=stateFor(rows),r=applyLogbookEditorEdit(s,{day,id:'on',expected:rows[1],patch:{note:'Fuel · Delivery / Unloading',reasons:['Fuel','Delivery / Unloading']}},at);
 assert.equal(r.ok,true);assert.deepEqual(r.state.eventsByDay[day].map(e=>[e.id,e.startMin,e.endMin]),rows.map(e=>[e.id,e.startMin,e.endMin]));assert.equal(r.timelineChanged,false);assert.deepEqual(r.state.eventsByDay[day][1].reasons,['Fuel','Delivery / Unloading']);
 console.log('PASS — multi-select activity metadata stays on one event without moving neighbors');
}
const editor=fs.readFileSync('source/src/modules/editor/EditEventSheet.jsx','utf8');
const insert=fs.readFileSync('source/src/modules/editor/InsertEditEventSheet.jsx','utf8');
const css=fs.readFileSync('source/src/modules/editor/compact-editor-v111.css','utf8');
assert.match(editor,/quick-activities-v11023/);assert.match(editor,/PTI/);assert.match(editor,/previewLogbookEditorOverride/);assert.match(editor,/previewResultV11023\?\.ok === false/);assert.doesNotMatch(editor,/<details className="compact-activities-v111"><summary>On duty activity/);
assert.match(insert,/MOTIVE_INSERT_QUICK_CHIPS_V11023/);assert.doesNotMatch(insert,/<details className="compact-activities-v111"><summary>Activity/);assert.match(insert,/quick-chip-check-v11023/);
assert.match(css,/quick-activities-v11023/);assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);assert.match(css,/@media\(max-width:360px\)/);
console.log('PASS — Edit and Insert expose compact, always-visible multi-select quick activity chips');
const meta=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));assert.equal(meta.version,'110.2.3');assert.equal(meta.build,'v110203-motive-override-chips');assert.equal(meta.force,false);
console.log('PASS — release identity 110.2.3 is explicit and non-forced');
