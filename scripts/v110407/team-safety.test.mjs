import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addTeamDriver, switchTeamDriver, sealActiveDriverLogbook, normalizeTeamDriverState, importedLogbookIntegrity, updateActiveTeamDriverName } from '../../source/src/core/team/teamLogbook.js';
import { recordedDeviceInventory, hasMeaningfulDeviceData, assertSafeDeviceImport } from '../../lib/local-db/deviceInventory.js';
import { fullBackupSummaryV105 } from '../../source/src/modules/backup/fullBackupV105.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('PASS — ' + name); };
const day = '2026-09-23';
const base = { activeDay:day, driverProfile:{name:'Driver Alpha'}, coDrivers:'Legacy Test Partner',
  eventsByDay:{[day]:[{id:'a1',status:'D',startMin:600,endMin:650,city:'Lima',state:'IN',source:'manual',note:'Driving'}]},
  signatureByDay:{[day]:{signed:true,driverName:'Driver Alpha',signedAt:123}},
  inspectionByDay:{[day]:{complete:true,checks:['brakes']}}, formByDay:{[day]:{driverName:'Recorded Alpha'}},
  loadInfo:{loadNo:'TEST-LOAD',broker:'Example Broker',pickupCity:'Lima',deliveryCity:'Chicago'}, currentTrailer:'TEST-53',
  routeLegsByDay:{[day]:[{id:'route-1',shippingDocs:'TEST-LOAD'}]},
};
const team = addTeamDriver(base,'Driver Beta',day), alpha = team.activeDriverId, beta = team.teamDrivers[1].id;
const second = switchTeamDriver(team,beta,day);
const inventory = (state,business={}) => ({...recordedDeviceInventory(state,business),complete:true});

test('legacy co-driver free text survives repeated normalization without guessing IDs', () => {
  const legacy = normalizeTeamDriverState(base);
  assert.equal(legacy.coDrivers,base.coDrivers);
  assert.equal(legacy.teamDrivers.length,1);
  assert.equal(normalizeTeamDriverState(legacy).coDrivers,base.coDrivers);
  assert.equal(normalizeTeamDriverState({...base,coDrivers:'Last, First / Unknown'}).legacyCoDrivers,'Last, First / Unknown');
});
test('adding a team member retains the original free text', () => assert.equal(team.legacyCoDrivers,base.coDrivers));
test('profile rename persists through normalization, switch and JSON reload', () => {
  const renamed = updateActiveTeamDriverName(team,'Alpha Updated');
  const reloaded = normalizeTeamDriverState(JSON.parse(JSON.stringify(renamed)));
  assert.equal(reloaded.driverProfile.name,'Alpha Updated');
  assert.equal(reloaded.teamDrivers[0].name,'Alpha Updated');
  const back = switchTeamDriver(switchTeamDriver(reloaded,beta,day),alpha,day);
  assert.equal(back.driverProfile.name,'Alpha Updated');
  assert.deepEqual(back.signatureByDay,base.signatureByDay);
  assert.deepEqual(back.formByDay,base.formByDay);
});
test('daily form does not leak into the other driver; shared load/trailer stay shared', () => {
  assert.deepEqual(second.formByDay,{});
  assert.deepEqual(second.loadInfo,base.loadInfo);
  assert.deepEqual(second.routeLegsByDay,base.routeLegsByDay);
  assert.equal(second.currentTrailer,base.currentTrailer);
  assert.deepEqual(switchTeamDriver(second,alpha,day).formByDay,base.formByDay);
});
test('inactive driver events/signatures/inspections are counted exactly once', () => {
  const i=inventory(second);
  assert.equal(i.events,1); assert.equal(i.signedLogs,1); assert.equal(i.inspections,1);
  assert.equal(i.driverCount,2); assert.equal(i.firstDay,day);
  assert.equal(inventory(sealActiveDriverLogbook(team)).events,1);
  assert.equal(inventory({...team,teamLogbooksByDriverId:{...team.teamLogbooksByDriverId,[alpha]:{eventsByDay:{[day]:Array(40).fill({id:'stale'})}}}}).events,1);
  assert.equal(hasMeaningfulDeviceData(i),true);
});
for (const bucket of ['loads','documents','fuel','maintenance','expenses','settlements']) test(bucket+'-only data needs protection', () => {
  assert.equal(hasMeaningfulDeviceData(inventory({}, {[bucket]:[{id:'fixture'}]})),true);
});
test('unsigned form and incomplete inspection are still user records', () => {
  assert.equal(hasMeaningfulDeviceData(inventory({inspectionByDay:{[day]:{complete:false,checked:['brakes']}}})),true);
  assert.equal(hasMeaningfulDeviceData(inventory({formByDay:{[day]:{driverName:'Draft'}}})),true);
});
test('unknown inventory and IndexedDB failure never unlock import', () => {
  assert.throws(()=>assertSafeDeviceImport(null,{sha256:'present'}),/could not be checked/);
  assert.throws(()=>assertSafeDeviceImport({events:0},null),/could not be checked/);
  assert.equal(hasMeaningfulDeviceData(null),true);
});
test('known empty device allows import, recorded device requires saved protection', () => {
  assert.doesNotThrow(()=>assertSafeDeviceImport(inventory({}),null));
  assert.throws(()=>assertSafeDeviceImport(inventory(second),null),/Create and save/);
  assert.doesNotThrow(()=>assertSafeDeviceImport(inventory(second),{verified:true}));
});
const exported = sealActiveDriverLogbook(second);
test('all-driver JSON round trip retains full logbook inventory', () => {
  const result = importedLogbookIntegrity(exported,JSON.parse(JSON.stringify(exported)));
  assert.equal(result.ok,true); assert.equal(result.sourceEvents,1);
});
test('missing inactive driver logbook is rejected even with empty active log', () => {
  const changed=structuredClone(exported); delete changed.teamLogbooksByDriverId[alpha];
  assert.equal(importedLogbookIntegrity(exported,changed).ok,false);
});
for (const [field,value] of [['id','different'],['status','OFF'],['startMin',620],['endMin',680],['city','Other'],['note','Changed']]) test('same-count changed '+field+' is rejected', () => {
  const changed=structuredClone(exported); changed.teamLogbooksByDriverId[alpha].eventsByDay[day][0][field]=value;
  assert.equal(importedLogbookIntegrity(exported,changed).ok,false);
});
test('duplicate IDs cannot hide a missing source event', () => {
  const source={eventsByDay:{[day]:[{id:'a'},{id:'b'}]}};
  assert.equal(importedLogbookIntegrity(source,{eventsByDay:{[day]:[{id:'a'},{id:'a'}]}}).ok,false);
});
test('missing signature, inspection, form or team member is rejected', () => {
  for(const field of ['signatureByDay','inspectionByDay','formByDay']) {
    const changed=structuredClone(exported); changed.teamLogbooksByDriverId[alpha][field]={};
    assert.equal(importedLogbookIntegrity(exported,changed).ok,false,field);
  }
  const changed=structuredClone(exported);changed.teamDrivers=changed.teamDrivers.filter(driver=>driver.id!==beta);
  assert.equal(importedLogbookIntegrity(exported,changed).ok,false);
});
test('synthetic carry cleanup remains allowed, but recorded events are checked', () => {
  const source={eventsByDay:{[day]:[{id:'real',status:'OFF',startMin:0,endMin:60},{id:'carry',source:'carryover',carriedFromPreviousDay:true}]}};
  assert.equal(importedLogbookIntegrity(source,{eventsByDay:{[day]:[source.eventsByDay[day][0]]}}).ok,true);
});
test('readable export summary includes inactive driver records and all business buckets', () => {
  const sum=fullBackupSummaryV105(second,{expenses:[{id:'e'}],settlements:[{id:'s'}]});
  assert.equal(sum.events,1);assert.equal(sum.signatures,1);assert.equal(sum.inspections,1);assert.equal(sum.businessRecords,2);
});
test('live integration uses original import evidence and rescans before replacement', () => {
  const app=fs.readFileSync('source/src/app/App.jsx','utf8'), screen=fs.readFileSync('source/src/modules/backup/BackupLogsScreen.jsx','utf8');
  assert.match(app,/function normalizeState\(s\) \{\s+s = normalizeTeamDriverState\(s\)/);
  assert.ok(app.includes('importedLogbookIntegrity(meta.sourceState || imported, restored)'));
  assert.ok(app.includes('...updateActiveTeamDriverName(s, value)'));
  assert.ok(app.includes('s.activeDay === localDayKey(new Date(), getHomeTerminalTimeZone(s))'));
  assert.ok(screen.indexOf('await checkCurrentDevice();\n      await onImportBackup')>0);
  assert.ok(screen.includes('sourceState:extracted.state'));
  assert.ok(!screen.includes('stored.inventory) setSafetyInventory'));
});
console.log(`${passed} team/import safety regressions passed`);
