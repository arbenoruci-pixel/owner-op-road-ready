import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DAY_BACKUP_KIND,
  applyDayBackupToState,
  buildDayBackupPayload,
  dayBackupSummary,
} from '../source/src/core/backup/dayTransfer.js';

const sourceDay = '2026-07-08';
const otherDay = '2026-07-09';
const state = {
  activeDay: sourceDay,
  eventsByDay: {
    [sourceDay]: [
      { id:'drive1', status:'D', startMin:0, endMin:80, city:'Youngstown', state:'OH', note:'Driving' },
      { id:'sleep1', status:'SB', startMin:80, endMin:680, city:'Cheshire', state:'CT', note:'Sleeper Berth' },
      { id:'on1', status:'ON', startMin:680, endMin:700, city:'Cheshire', state:'CT', note:'On Duty' },
    ],
    [otherDay]: [{ id:'existing', status:'OFF', startMin:0, endMin:1440, city:'Chicago', state:'IL' }],
  },
  certifyStatus: { [sourceDay]:'Certified', [otherDay]:'Needs signature' },
  signatureByDay: { [sourceDay]:{ signed:true, signatureRef:'driverSignature' } },
  inspectionByDay: { [sourceDay]:{ complete:true, sourceEventId:'on1' } },
  routeLegsByDay: { [sourceDay]:[{ id:'leg1', kind:'pickup' }] },
  manualMilesByDay: { [sourceDay]:123.4 },
  driverSignature: { dataUrl:'data:image/png;base64,abc' },
  currentStatus:'OFF',
  currentReason:'Off Duty',
  currentLocation:{ city:'Chicago', state:'IL' },
  gpsTrip:{ status:'active' },
  homeTerminalTimeZone:'America/New_York',
};

const payload = buildDayBackupPayload(state, sourceDay, '96.0.0');
assert.equal(payload.kind, DAY_BACKUP_KIND);
assert.equal(payload.sourceDay, sourceDay);
assert.equal(payload.dayData.events.length, 3);
assert.equal(payload.dayData.manualMiles, 123.4);
assert.equal(dayBackupSummary(payload).signed, true);
assert.equal(payload.dayData.events.some(event => event.id === 'existing'), false);

const sameDay = applyDayBackupToState({
  ...state,
  eventsByDay:{ ...state.eventsByDay, [sourceDay]:[{ id:'broken', status:'D', startMin:0, endMin:900 }] },
}, payload, sourceDay, { filename:'same-day.json' });
assert.deepEqual(sameDay.eventsByDay[sourceDay].map(event => event.id), ['drive1','sleep1','on1']);
assert.equal(sameDay.signatureByDay[sourceDay].signed, true);
assert.equal(sameDay.inspectionByDay[sourceDay].complete, true);
assert.equal(sameDay.dayImportBackupByDay[sourceDay].events[0].id, 'broken');

const copied = applyDayBackupToState(state, payload, otherDay, { filename:'copy-day.json' });
assert.equal(copied.eventsByDay[otherDay].length, 3);
assert.notEqual(copied.eventsByDay[otherDay][0].id, 'drive1');
assert.equal(copied.eventsByDay[otherDay][0].importedFromDay, sourceDay);
assert.equal(copied.signatureByDay[otherDay], undefined);
assert.equal(copied.inspectionByDay[otherDay], undefined);
assert.equal(copied.certifyStatus[otherDay], 'Needs signature');
assert.equal(copied.eventsByDay[sourceDay].length, 3);

const appSource = fs.readFileSync(path.resolve('source/src/app/App.jsx'), 'utf8');
const dayScreen = fs.readFileSync(path.resolve('source/src/modules/logbook/DayLogScreen.jsx'), 'utf8');
const tools = fs.readFileSync(path.resolve('source/src/shared/ui/ToolsSheet.jsx'), 'utf8');
assert.match(appSource, /applyDayBackupToState/);
assert.match(appSource, /type:'dayTransfer'/);
assert.doesNotMatch(appSource, /applyUserConfirmedJul10TimelineRepair/);
assert.match(dayScreen, /Export \/ Import this day/);
assert.match(tools, /Export \/ import this day/);

console.log('v96.0 single-day export/import checks passed');
