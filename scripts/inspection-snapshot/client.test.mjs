import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {verifyInspectionRecords} from '../inspection-wizard/sync.js';
import {captureInspection,assertArchiveCoverage,assertInspectionUnchanged} from '../../lib/owner-op-cloud/inspectionSnapshot.js';
const at=new Date('2026-10-28T14:39:00Z');
class FixedDate extends Date {constructor(...args){super(...(args.length?args:[at]));}static now(){return +at;}}
const event={id:'recorded',status:'SB',startMin:1300,endMin:1301,source:'manual',live:true};
function setup({archive=[],syncResult={revision:7},changeDuringUpload=false}={}){
 let state={homeTerminalTimeZone:'America/New_York',eventsByDay:{'2026-10-27':[event]}},packet;const calls=[];
 const context={navigator:{onLine:true},window:{},Date:FixedDate,TextDecoder,verifyInspectionRecords,
 captureInspection:(s,t)=>captureInspection(s,t||at),assertArchiveCoverage,assertInspectionUnchanged,
 cloudSession:async()=>({user:{id:'owner'}}),assertActiveDevice:async()=>{},deviceId:()=> 'device',flushAppSnapshots:async()=>{},
 localState:async()=>{throw Error('stale disk must not replace live state');},
 syncAccount:async()=>{state={...state,driverProfile:{name:'Latest driver'},carrierDot:'12345'};return syncResult;},
 readCloudFile:async()=>new TextEncoder().encode(JSON.stringify(archive[0])),
 cloudApi:async p=>{calls.push(p);if(p.action==='catalog')return {days:archive.map(s=>({log_date:s.sourceDay,current_file_id:'archived',content_sha256:'sha'}))};
 if(p.action==='create_snapshot_share'){packet=p;if(changeDuringUpload)state={...state,carrierDot:'changed'};return {id:'new-share',log_count:8,captured_at:p.inspection.capturedAt};}
 if(p.action==='revoke_share')return {};throw Error('Unexpected '+p.action);}};
 const code=fs.readFileSync('scripts/inspection-snapshot/client.js','utf8').replace(/^import .*;\n/gm,'').replace('export async function createCurrentInspectionShare','async function createCurrentInspectionShare');
 vm.runInNewContext(code+'\nglobalThis.create=createCurrentInspectionShare;',context);
 return {calls,packet:()=>packet,create:()=>context.create({getState:()=>state})};
}
test('share captures current live state after synchronization and binds exact eight snapshots',async()=>{
 const t=setup(),r=await t.create();assert.equal(r.log_count,8);const p=t.packet();assert.equal(p.inspection.profile.driverName,'Latest driver');assert.equal(p.inspection.profile.usdot,'12345');assert.equal(p.inspection.snapshots.length,8);assert.equal(p.expected_revision,7);assert.equal(Object.keys(p.expected_archive).length,8);assert.equal(p.inspection.snapshots[6].dayData.events[0].id,'recorded');
});
test('incomplete sync or missing archived events never sends a share request',async()=>{
 for(const syncResult of [{revision:7,handoffPending:true},{revision:7,conflicts:['day']},{deferred:true}]){const t=setup({syncResult});await assert.rejects(t.create(),/latest logbook could not be verified/);assert.ok(!t.packet());}
 const t=setup({archive:[{sourceDay:'2026-10-27',dayData:{events:[{...event,id:'missing-record'}]}}]});await assert.rejects(t.create(),/missing saved records/);assert.ok(!t.packet());
});
test('an edit while uploading revokes the new snapshot and never returns an outdated link',async()=>{
 const t=setup({changeDuringUpload:true});await assert.rejects(t.create(),/logbook changed/);assert.equal(t.calls.at(-1).action,'revoke_share');assert.equal(t.calls.at(-1).payload.id,'new-share');
});
