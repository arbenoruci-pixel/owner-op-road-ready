import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { addTeamDriver, switchTeamDriver, sealActiveDriverLogbook, importedLogbookIntegrity } from '../../source/src/core/team/teamLogbook.js';
import { recordedDeviceInventory, hasMeaningfulDeviceData } from '../../lib/local-db/deviceInventory.js';
import { buildFullBackupPayloadV105 } from '../../source/src/modules/backup/fullBackupV105.js';
import { repairRoadReadyStateV107 } from '../../source/src/core/integrity/logbookIntegrityV107.js';

// Exercise the real startup/import normalizer, including its protected-day boundary.
const app=fs.readFileSync('source/src/app/App.jsx','utf8');
const start=app.indexOf('function defaultInitialState()');
assert.ok(start>0);
const prefix=app.slice(0,start).replace(/^import .* from ['"][^'"]+\.jsx['"];?\n/gm,'').replace(/^import React[^\n]+\n/gm,'').replace(/^import .* from ['"][^'"]*(?:clientSync|authBridge)\.js['"];?\n/gm,'');
const temp='source/src/app/.normalize-team-v110407-test.mjs';
fs.writeFileSync(temp,prefix+'\n'+app.match(/function sorted\(events\) \{[\s\S]*?\n\}/)[0]+'\nexport { normalizeState };\n');
try {
  const {normalizeState}=await import(pathToFileURL(process.cwd()+'/'+temp));
  const day='2026-09-23';
  const fresh=normalizeState({activeDay:day,eventsByDay:{},inspectionByDay:{},signatureByDay:{},driverProfile:{name:'Driver Alpha'},currentStatus:'OFF',routeLegsByDay:{},loadInfo:{}});
  assert.equal(hasMeaningfulDeviceData({...recordedDeviceInventory(fresh,{}),complete:true}),false);
  const base={...fresh,activeDay:day,coDrivers:'Legacy Partner',legacyCoDrivers:'Legacy Partner',eventsByDay:{[day]:[
    {id:'a-off',status:'OFF',startMin:0,endMin:600,city:'Lima',state:'IN',source:'manual',note:'Off Duty'},
    {id:'a-on',status:'ON',startMin:600,endMin:630,city:'Lima',state:'IN',source:'manual',note:'Pre-trip inspection'},
    {id:'a-drive',status:'D',startMin:630,endMin:700,city:'Lima',state:'IN',source:'manual',note:'Driving'},
    {id:'a-end',status:'OFF',startMin:700,endMin:1440,city:'Lima',state:'IN',source:'manual',note:'Off Duty'},
  ]},inspectionByDay:{[day]:{complete:true,type:'pretrip',checked:['brakes'],sourceStartMin:600,sourceEndMin:630,completedAt:1790160000000}},formByDay:{[day]:{driverName:'Recorded Alpha'}}};
  const team=addTeamDriver(base,'Driver Beta',day), beta=team.teamDrivers[1].id;
  const second=switchTeamDriver(team,beta,day);
  const source=sealActiveDriverLogbook({...second,eventsByDay:{[day]:[{id:'b-off',status:'OFF',startMin:0,endMin:1440,city:'Lima',state:'IN',source:'manual',note:'Off Duty'}]}});
  const payload=buildFullBackupPayloadV105(source,{},{});
  assert.equal(importedLogbookIntegrity(source,payload.state).ok,true,'export itself preserves original driver evidence');
  const repaired=repairRoadReadyStateV107(structuredClone(payload.state),{nowDay:'2026-09-25',repairNavigation:true,source:'full_backup_import_v107'});
  const restored=normalizeState(repaired);
  assert.equal(importedLogbookIntegrity(payload.state,restored).ok,true,'original file survives both import normalization layers');
  const reload=normalizeState(JSON.parse(JSON.stringify(restored)));
  assert.equal(importedLogbookIntegrity(payload.state,reload).ok,true,'reloading preserves every driver');
  assert.equal(recordedDeviceInventory(reload,{}).events,5);
  assert.equal(reload.legacyCoDrivers,'Legacy Partner');
  console.log('PASS — actual export → repair → normalize → JSON reload preserves both driver logbooks; fresh device remains importable');
} finally {
  fs.rmSync(temp,{force:true});
}
