import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {captureInspection} from '../../lib/owner-op-cloud/inspectionSnapshot.js';
const at=new Date('2026-10-28T14:39:00Z');
function setup(){
 let handler;const calls=[];
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:[at]));}static now(){return +at;}}
 const context={Date:FixedDate,TextEncoder,TextDecoder,Uint8Array,Response,Request,Blob,CompressionStream,DecompressionStream,AbortSignal,crypto:webcrypto,atob,
  Deno:{env:{get:name=>'test-'+name},serve:fn=>handler=fn},
  fetch:async(url,opts={})=>{
   calls.push({url,body:typeof opts.body==='string'?JSON.parse(opts.body):null});
   if(url.endsWith('/auth/v1/user'))return Response.json({id:'00000000-0000-4000-8000-000000000001'});
   if(url.includes('/storage/v1/object/'))return new Response('ok');
   if(url.endsWith('/rpc/owner_op_cloud_v1')){const p=JSON.parse(opts.body);assert.equal(p.p_action,'register_file','share must never overwrite log_days');return Response.json({id:'00000000-0000-4000-8000-'+String(calls.length).padStart(12,'0')});}
   if(url.endsWith('/rpc/owner_op_create_inspection_snapshot_v1')){const p=JSON.parse(opts.body).p_payload;return Response.json({id:'share',log_count:8,captured_at:p.captured_at});}
   throw Error('Unexpected request '+url);
  }};
 vm.runInNewContext(fs.readFileSync('supabase/functions/owner-op-cloud-v1/index.ts','utf8'),context);
 return {calls,send:async(body,authenticated=true)=>handler(new Request('https://test.local',{method:'POST',headers:{'content-type':'application/json',...(authenticated?{authorization:'Bearer test-session'}:{})},body:JSON.stringify(body)}))};
}
const request=()=>({action:'create_snapshot_share',inspection:captureInspection({homeTerminalTimeZone:'America/New_York',eventsByDay:{}},at),expected_revision:7,expected_archive:{},device_id:'device',wallet_keys:[]});
test('server binds eight immutable exact files, cutoff and expected account/archive revisions',async()=>{
 const t=setup(),p=request(),r=await t.send(p);assert.equal(r.status,200);const result=await r.json();assert.equal(result.result.log_count,8);assert.match(result.result.token,/^[a-f0-9]{64}$/);
 const commit=t.calls.find(c=>c.url.endsWith('/rpc/owner_op_create_inspection_snapshot_v1')).body.p_payload;
 assert.equal(commit.logs.length,8);assert.equal(commit.captured_at,at.toISOString());assert.equal(commit.expected_revision,7);
 assert.equal(new Set(commit.logs.map(x=>x.file_id)).size,8);assert.ok(commit.logs.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
});
test('old archive-only sharing is refused; existing inspection reading remains available',async()=>{
 const t=setup(),r=await t.send({action:'create_share'});assert.equal(r.status,409);assert.match((await r.json()).error,/Update Road Ready/);assert.equal(t.calls.length,1);
});
test('incomplete, misdated, stale and unauthenticated capture requests cannot create a link',async()=>{
 for(const mutate of [p=>p.inspection.snapshots.pop(),p=>p.inspection.snapshots[0].sourceDay='2026-10-01',p=>p.inspection.capturedAt='2026-10-27T00:00:00Z']){
  const t=setup(),p=request();mutate(p);const r=await t.send(p);assert.ok(r.status>=400);assert.ok(!t.calls.some(c=>c.url.endsWith('/rpc/owner_op_create_inspection_snapshot_v1')));
 }
 const t=setup();assert.equal((await t.send(request(),false)).status,401);assert.equal(t.calls.length,0);
});
