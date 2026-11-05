import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fixture,at} from './fixture.mjs';
import {captureInspection,assertInspectionUnchanged,assertInspectionComplete} from '../../lib/owner-op-cloud/inspectionSnapshot.js';
class FixedDate extends Date{constructor(...args){super(...(args.length?args:[at]));}static now(){return +at;}}
function setup({receive=false,revision=7,changeDuringUpload=false,offline=false,unsigned=false,revoked=false}={}){
  let state=fixture(),packet;const calls=[],queries=[],before=structuredClone(state);
  if(unsigned)delete state.signatureByDay['2026-10-30'];
  const query={select:columns=>{queries.push(columns);return query;},eq:(key,value)=>{assert.equal(key,'user_id');assert.equal(value,'owner');return query;},maybeSingle:async()=>({data:{revision}})};
  const context={Date:FixedDate,navigator:{onLine:!offline},window:{},
    captureInspection:s=>captureInspection(s,at),assertInspectionUnchanged,assertInspectionComplete,
    cloudSession:async()=>({user:{id:'owner'}}),assertActiveDevice:async()=>{if(revoked)throw Error('Device revoked');return {active:true,receive};},deviceId:()=> 'device',flushAppSnapshots:async()=>{},bounded:async promise=>promise,
    cloudClient:()=>({from:table=>{assert.equal(table,'road_ready_account_workspaces');return query;}}),
    localState:async()=>{throw Error('Must use live state');},
    cloudApi:async p=>{calls.push(p);if(p.action==='catalog')return {days:[{log_date:'2026-10-30',current_file_id:'older-account-copy'}]};
      if(p.action==='create_snapshot_share'){packet=p;if(changeDuringUpload)state.signatureByDay['2026-10-30'].certifiedContent.events[0].note='New signed version';return {id:'share',log_count:8,captured_at:p.inspection.capturedAt};}
      if(p.action==='revoke_share')return {};throw Error('Unexpected account mutation '+p.action);},
    syncAccount:()=>{throw Error('Inspection must not reconcile account copies');},readCloudFile:()=>{throw Error('Inspection must not compare archived copies');}};
  const code=fs.readFileSync('scripts/inspection-signed/client.js','utf8').replace(/^import .*;\n/gm,'').replace('export async function createCurrentInspectionShare','async function createCurrentInspectionShare');
  vm.runInNewContext(code+'\nglobalThis.create=createCurrentInspectionShare;',context);
  return {calls,queries,before,state:()=>state,packet:()=>packet,create:()=>context.create({getState:()=>state})};
}
test('stale account copies never trigger a comparison or write; only signed inspection files are published',async()=>{
  const t=setup(),result=await t.create();assert.equal(result.log_count,8);assert.deepEqual(t.queries,['revision']);
  assert.deepEqual(t.calls.map(p=>p.action),['catalog','create_snapshot_share']);
  assert.equal(t.packet().expected_revision,7);assert.equal(t.packet().expected_archive['2026-10-30'],'older-account-copy');
  assert.equal(t.packet().inspection.snapshots.at(-1).inspectionView.cutoff,1162);
  assert.deepEqual(t.state(),t.before);
});
test('offline, receiving, revoked device, unsigned day and missing revision fail before publication',async()=>{
  for(const options of [{receive:true},{offline:true},{revision:null},{unsigned:true},{revoked:true}]){
    const t=setup(options);await assert.rejects(t.create());assert.equal(t.packet(),undefined);
  }
});
test('signed evidence changing during upload revokes the link',async()=>{
  const t=setup({changeDuringUpload:true});await assert.rejects(t.create(),/changed/);
  assert.equal(t.calls.at(-1).action,'revoke_share');assert.equal(t.calls.at(-1).payload.id,'share');
});
