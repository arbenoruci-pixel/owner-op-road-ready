import assert from 'node:assert/strict';
import { register } from 'node:module';
import { mock } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { carryCorrectionDefaults } from '../source/src/modules/logbook/carryCorrection.js';
import { applyLogbookEditorInsert, previewLogbookInsertOverride, projectLogbookEvents } from '../source/src/modules/logbook/eventEditingV110.js';
import { displayEventsForDayFromState } from '../source/src/core/timeline/displayTimeline.js';
import { dutyViewEvents } from '../source/src/modules/logbook/dutyViewV110212.js';
import { createCertificationRecord, certificationStatusV1032 } from '../source/src/modules/logbook/certificationV110.js';

register(new URL('./test-jsx-loader.mjs', import.meta.url));
const { default: DayLogScreen } = await import('../source/src/modules/logbook/DayLogScreen.jsx');
const { default: InsertSheet } = await import('../source/src/modules/editor/InsertEditEventSheet.jsx');
const day = '2026-09-16', prior = '2026-09-15', at = new Date('2026-09-17T06:00:00Z');
mock.timers.enable({ apis:['Date'], now:at });
const row = (id, status, startMin, endMin) => ({id,status,startMin,endMin,source:'manual',city:'New York',state:'NY',note:status});
function fixture(status = 'OFF', empty = false) {
  return {activeDay:day,homeTerminalTimeZone:'America/New_York',selectedEventId:null,selectedIds:[],selectMode:false,
    currentStatus:'OFF',currentLocation:{city:'New York',state:'NY'},currentTrailer:'TEST',driver:{truck:'TEST',trailer:'TEST'},driverProfile:{name:'Synthetic Driver'},
    eventsByDay:{[prior]:[row('prior',status,1200,1440)],[day]:empty ? [] : [row('pti','ON',617,632),row('drive','D',632,725),row('rest','OFF',725,1440)],'2026-09-17':[row('today','OFF',0,120)]},
    signatureByDay:{[prior]:{signed:true,marker:'retain'}},certifyStatus:{},formByDay:{},routeLegsByDay:{},inspectionByDay:{},loadGuidesById:{keep:{id:'keep'}},logbookEditHistoryByDay:{}};
}
function view(state) {
  return dutyViewEvents(projectLogbookEvents(state, day, at), displayEventsForDayFromState(state.eventsByDay, day, {today:'2026-09-17',nowMinute:120}), {day,eventsByDay:state.eventsByDay});
}
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS — ' + name); }
for (const status of ['OFF','SB','ON']) test(status + ' continuation opens a bounded draft and saves only this day', () => {
  const state = fixture(status), before = structuredClone(state), carry = view(state)[0], defaults = carryCorrectionDefaults(carry);
  assert.deepEqual(defaults, {mode:'insert',carryCorrection:true,status,startMin:0,endMin:617,city:'New York',state:'NY'});
  assert.deepEqual(state, before, 'opening a draft cannot materialize the carry');
  const command = {day,expectedRows:structuredClone(state.eventsByDay[day]),event:row('correction',status === 'SB' ? 'OFF' : 'SB',0,617)};
  const preview = previewLogbookInsertOverride(state, command, at);
  assert.equal(preview.ok, true, preview.error);
  assert.deepEqual(state, before, 'preview/cancel leaves all records unchanged');
  const result = applyLogbookEditorInsert(state, command, at);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.events, preview.events);
  assert.deepEqual(result.events.find(e => e.id === 'correction'), command.event);
  assert.deepEqual(result.events.filter(e => e.id !== 'correction'), state.eventsByDay[day]);
  for (const key of ['signatureByDay','routeLegsByDay','loadGuidesById','inspectionByDay','currentStatus']) assert.deepEqual(result.state[key], before[key]);
  assert.deepEqual(result.state.eventsByDay[prior], before.eventsByDay[prior]);
  assert.deepEqual(result.state.eventsByDay['2026-09-17'], before.eventsByDay['2026-09-17']);
  assert.deepEqual(result.state.logbookEditHistoryByDay[day][0].beforeEvents, before.eventsByDay[day]);
  const reopened = JSON.parse(JSON.stringify(result.state));
  reopened.eventsByDay[prior][0].status = 'ON';
  assert.equal(view(reopened)[0].status, command.event.status, 'saved correction no longer inherits a later prior-day change');
});
test('partial correction of an empty carried day preserves both remaining intervals', () => {
  const state = fixture('OFF', true), before = structuredClone(state);
  assert.equal(carryCorrectionDefaults(view(state)[0]).endMin, 1440);
  const result = applyLogbookEditorInsert(state, {day,expectedRows:[],event:row('part','SB',240,600)}, at);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.events.map(e => [e.status,e.startMin,e.endMin]), [['OFF',0,240],['SB',240,600],['OFF',600,1440]]);
  assert.deepEqual(state, before);
  assert.deepEqual(result.state.eventsByDay[prior], before.eventsByDay[prior]);
  assert.deepEqual(result.state.logbookEditHistoryByDay[day][0].beforeEvents, []);
});
test('current-day prefix correction leaves the following live status and its clock intact', () => {
  const state = fixture(); state.activeDay = '2026-09-17'; state.currentStatus = 'ON';
  state.eventsByDay[day] = [row('yesterday','OFF',0,1440)];
  state.eventsByDay[state.activeDay] = [{...row('live','ON',90,91),source:'live_status'}];
  const result = applyLogbookEditorInsert(state, {day:state.activeDay,expectedRows:state.eventsByDay[state.activeDay],event:row('prefix','SB',0,90)}, at);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.state.currentStatus, 'ON');
  assert.equal(result.state.eventsByDay[state.activeDay].find(e => e.id === 'live').endMin, 91);
  assert.equal(projectLogbookEvents(result.state, state.activeDay, at).find(e => e.id === 'live').endMin, 120);
});
test('stale day data prevents saving an obsolete correction draft', () => {
  const state = fixture(), expectedRows = structuredClone(state.eventsByDay[day]);
  state.eventsByDay[day][0].note = 'changed elsewhere';
  const before = structuredClone(state);
  const result = applyLogbookEditorInsert(state, {day,expectedRows,event:row('stale','SB',0,617)}, at);
  assert.equal(result.ok, false); assert.match(result.error, /day changed/i); assert.deepEqual(state, before);
});
test('correcting a signed day requires recertification and preserves the original attestation', () => {
  const state = fixture();
  state.signatureByDay[day] = createCertificationRecord(state, day, {driverName:'Synthetic Driver',now:at.getTime()});
  state.certifyStatus[day] = 'Certified';
  assert.equal(certificationStatusV1032(state, day).status, 'Certified');
  const signature = structuredClone(state.signatureByDay[day]);
  const result = applyLogbookEditorInsert(state, {day,expectedRows:state.eventsByDay[day],event:row('corrected','SB',0,617)}, at);
  assert.equal(result.ok, true, result.error);
  assert.equal(certificationStatusV1032(result.state, day).status, 'Needs Recertification');
  assert.deepEqual(result.state.signatureByDay[day], signature);
  assert.deepEqual(result.state.signatureByDay[prior], state.signatureByDay[prior]);
});
test('real, driving, invalid and zero-length rows cannot masquerade as a continuation draft', () => {
  const base = {...row('carry','OFF',0,617),displayOnly:true};
  for (const event of [null,row('stored','OFF',0,617),{...base,status:'D'},{...base,startMin:-1},{...base,endMin:1441},{...base,endMin:0},{...base,startMin:0.5}]) assert.equal(carryCorrectionDefaults(event), null);
});
test('real DayLogScreen and correction sheet render Edit, the exact interval, and no Sign badge', () => {
  const state = fixture(), before = structuredClone(state);
  const html = renderToStaticMarkup(React.createElement(DayLogScreen, {state,events:[],liveCurrent:{status:'OFF'}}));
  assert.match(html, /aria-label="Edit continued status"/);
  assert.doesNotMatch(html, /event-continuity-tag-v11026/);
  const sheet = renderToStaticMarkup(React.createElement(InsertSheet, {defaults:carryCorrectionDefaults(view(state)[0]),events:[],logbookContext:state}));
  assert.match(sheet, /Edit Duty Status/); assert.match(sheet, /Save this interval for.*2026-09-16/);
  assert.match(sheet, /value="00:00"/); assert.match(sheet, /value="10:17"/);
  assert.deepEqual(state, before);
});
console.log(count + ' carried-status correction regression groups passed');
