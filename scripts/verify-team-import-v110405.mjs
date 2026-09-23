import assert from 'node:assert/strict';
import {
  addTeamDriver,
  importedLogbookIntegrity,
  normalizeTeamDriverState,
  sealActiveDriverLogbook,
  switchTeamDriver,
} from '../source/src/core/team/teamLogbook.js';

const day = '2026-09-23';
const base = normalizeTeamDriverState({
  activeDay:day,
  driverProfile:{ name:'Arben Oruci' },
  eventsByDay:{ [day]:[{ id:'a', status:'D', startMin:600, endMin:660 }] },
  certifyStatus:{ [day]:'Active day / Not certified yet' },
  inspectionByDay:{ [day]:{ complete:true } },
  signatureByDay:{},
  currentStatus:'D',
  currentReason:'Driving',
  currentLocation:{ city:'Chicago', state:'IL' },
});

const withTeam = addTeamDriver(base, 'Team Driver', day);
assert.equal(withTeam.teamDrivers.length, 2);
const secondId = withTeam.teamDrivers[1].id;

const second = switchTeamDriver(withTeam, secondId, day);
assert.equal(second.driverProfile.name, 'Team Driver');
assert.deepEqual(second.eventsByDay[day], []);
assert.equal(second.currentStatus, 'OFF');

const secondWithLog = {
  ...second,
  eventsByDay:{ [day]:[{ id:'b', status:'OFF', startMin:0, endMin:120 }] },
  currentStatus:'OFF',
};
const back = switchTeamDriver(secondWithLog, withTeam.teamDrivers[0].id, day);
assert.equal(back.driverProfile.name, 'Arben Oruci');
assert.equal(back.eventsByDay[day][0].id, 'a');

const sealed = sealActiveDriverLogbook(back, day);
assert.equal(sealed.teamLogbooksByDriverId[sealed.activeDriverId].eventsByDay[day][0].id, 'a');

const integrity = importedLogbookIntegrity(
  { eventsByDay:{ [day]:[{ id:'1' }, { id:'2' }, { id:'3' }, { id:'4' }] } },
  { eventsByDay:{ [day]:[{ id:'1' }, { id:'2' }, { id:'3' }, { id:'4' }] } },
);
assert.equal(integrity.ok, true);
assert.equal(integrity.sourceEvents, 4);

const broken = importedLogbookIntegrity(
  { eventsByDay:{ [day]:[{ id:'1' }, { id:'2' }] } },
  { eventsByDay:{ [day]:[{ id:'1' }] } },
);
assert.equal(broken.ok, false);
assert.equal(broken.missing[0].day, day);

console.log('team/import v110.4.5 checks passed');
