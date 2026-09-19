import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pickupGuideIdentity} from '../../source/src/core/integrity/pickupGuideIdentity.js';
import {repairRoadReadyStateV107} from '../../source/src/core/integrity/logbookIntegrityV107.js';

const day='2026-09-18';
const guide={id:'guide',loadNo:'TRIP-A',status:'open',pickupDate:day,stops:[
  {type:'pickup',city:'Origin',state:'WI',date:day},
  {type:'delivery',city:'Destination',state:'WI',date:day},
]};
const pickup={id:'pickup',status:'ON',startMin:600,endMin:615,city:'Origin',state:'WI',
  note:'Hook / Pickup Trailer',reasons:[],loadNo:'TRIP-A',shippingDocs:'TRIP-A',bol:'BOL-A'};

test('a matching load without destination evidence cannot confirm a pickup',()=>{
  for(const destination of [undefined,'','   ']){
    const result=pickupGuideIdentity({...pickup,destination},guide);
    assert.equal(result.matches,false);
    assert.ok(result.failures.includes('missing_destination'));
  }
});
test('either recorded destination source can confirm a pickup; conflicting sources still block it',()=>{
  assert.equal(pickupGuideIdentity({...pickup,destination:'Destination',destinationState:'WI'},guide).matches,true);
  assert.equal(pickupGuideIdentity({...pickup,description:'Load TRIP-A · To Destination, WI'},guide).matches,true);
  assert.equal(pickupGuideIdentity({...pickup,destination:'Other',destinationState:'WI',description:'Load TRIP-A · To Destination, WI'},guide).matches,false);
});
test('normalization leaves an incomplete pickup unlinked and preserves its original record',()=>{
  const state={activeDay:day,eventsByDay:{[day]:[pickup]},routeLegsByDay:{},
    loadInfo:{guideId:guide.id,loadNo:'TRIP-A',sourceEventId:pickup.id,sourceEventDay:day},
    activeLoadGuideId:guide.id,loadGuidesById:{[guide.id]:guide}};
  const original=structuredClone(state);
  const result=repairRoadReadyStateV107(state,{nowDay:day});
  assert.deepEqual(state,original);
  assert.deepEqual(result.eventsByDay,original.eventsByDay);
  assert.equal(result.loadInfo.sourceEventId,'');
  assert.ok(Object.values(result.routeLegsByDay).flat().every(leg=>leg.pickupEventId!==pickup.id));
});

const prefix='scripts/v110378';
const packs=['ui-edits','integrity-edits','tests-edits','new-core','new-components','new-activities','new-style'];
const targets=[...new Set(packs.flatMap(name=>Object.keys(JSON.parse(fs.readFileSync(`${prefix}/${name}.json`)))))];
targets.push('scripts/browser-editor-grips-v110355.mjs','module-locks.v1.json');
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'duty-review-'));
  fs.cpSync(prefix,path.join(dir,prefix),{recursive:true});
  for(const file of targets){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.copyFileSync(file,path.join(dir,file));}
  return dir;
}
const snapshot=dir=>Object.fromEntries(targets.map(file=>[file,fs.readFileSync(path.join(dir,file),'utf8')]));
function run(dir,stage){return spawnSync(process.execPath,[`${prefix}/${stage}.mjs`],{cwd:dir,encoding:'utf8'});}
test('repeating all duty installation stages leaves the final runtime byte-identical',()=>{
  const dir=fixture();
  try{
    const before=snapshot(dir);
    for(let attempt=0;attempt<2;attempt++)for(const stage of ['install','finish-mobile','finish-interaction']){
      const result=run(dir,stage);assert.equal(result.status,0,result.stderr);
    }
    assert.deepEqual(snapshot(dir),before);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('unknown downstream edits still fail exact validation before any file is written',()=>{
  for(const file of ['scripts/browser-insert-interaction-v110316.mjs','source/src/shared/duty/dutyForm.css','source/src/modules/editor/EditEventSheet.jsx','source/src/modules/logbook/DayLogScreen.jsx']){
    const dir=fixture();
    try{
      fs.appendFileSync(path.join(dir,file),'\n/* unrecognized edit */\n');
      const before=snapshot(dir),result=run(dir,'install');
      assert.notEqual(result.status,0,file);
      assert.match(result.stderr,/Exact 110\.3\.77 baseline changed/);
      assert.deepEqual(snapshot(dir),before);
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
  }
});
