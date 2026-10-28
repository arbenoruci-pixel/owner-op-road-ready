import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
// Embedded Postgres only: all identities and records below are synthetic.
const { PGlite } = await import(pathToFileURL(process.env.ROAD_READY_PGLITE_MODULE).href);
const migration = fs.readFileSync('supabase/migrations/20261028173922_account_patch_bounded_delta.sql','utf8');
const baseline = fs.readFileSync('scripts/account-patch/baseline.sql','utf8');
const owner='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002';
const device='00000000-0000-4000-8000-000000000011', session='00000000-0000-4000-8000-000000000021';
const db = new PGlite();
await db.exec(`
 create schema auth; create schema road_ready_private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('session_id',current_setting('test.session',true))$$;
 create function public.owner_op_access_v1() returns jsonb language sql as $$select jsonb_build_object('approved',current_setting('test.approved',true)='true')$$;
 create table auth.sessions(id uuid primary key,user_id uuid);
 create table public.road_ready_backup_settings(user_id uuid primary key,record_sync_enabled boolean);
 create table public.road_ready_account_workspaces(user_id uuid primary key,revision bigint,device_id uuid,payload jsonb,updated_at timestamptz default now());
 create table public.road_ready_account_history(user_id uuid,revision bigint,device_id uuid,payload jsonb,primary key(user_id,revision));
 create table road_ready_private.active_devices(user_id uuid primary key,device_id uuid,session_id uuid,receive_pending boolean);
 create function road_ready_private.guard_active_account() returns trigger language plpgsql security definer set search_path='' as $$
 declare u uuid:=auth.uid(); s uuid:=(auth.jwt()->>'session_id')::uuid; r road_ready_private.active_devices;
 begin
  if u is null or new.user_id<>u then raise exception 'Account owner required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,110455));
  select * into r from road_ready_private.active_devices where user_id=u;
  if r.user_id is null or (r.device_id<>new.device_id or (r.session_id is not null and (s is distinct from r.session_id or not exists(select 1 from auth.sessions where id=s and user_id=u))) or r.receive_pending) then
   raise exception 'This device is no longer active or has not received the latest logbook. Sign in again.' using errcode='42501';
  end if;
  return new;
 end;$$;
 create trigger road_ready_active_account_write before update on public.road_ready_account_workspaces for each row execute function road_ready_private.guard_active_account();
`);
await db.exec(baseline);
// Keep independent copies of the original pair for behavior comparison.
await db.exec(baseline.replaceAll('road_ready_private.patch_account','road_ready_private.baseline_patch').replaceAll('road_ready_private.commit_account','road_ready_private.baseline_commit'));
await db.exec(migration);
const initial={format:'road_ready_account_v1',seed_snapshot:'retained-seed',records:{
 day:{events:[{id:'original',start:500,end:600,status:'D'}],signature:{signed:true,signedAt:1000}},
 second:{events:[{id:'keep',status:'SB'}]},empty:[],nullable:null,old:{v:1}
}};
async function seed(payload=initial){
 await db.exec(`truncate public.road_ready_account_workspaces,public.road_ready_account_history,public.road_ready_backup_settings,road_ready_private.active_devices,auth.sessions;
 select set_config('test.uid','${owner}',false),set_config('test.session','${session}',false),set_config('test.approved','true',false);
 insert into public.road_ready_backup_settings values('${owner}',true);
 insert into auth.sessions values('${session}','${owner}');
 insert into road_ready_private.active_devices values('${owner}','${device}','${session}',false);`);
 await db.query('insert into public.road_ready_account_workspaces(user_id,revision,device_id,payload) values($1,1,$2,$3),($4,9,$2,$3)',[owner,device,JSON.stringify(payload),other]);
}
async function patch(name,changes={},deleted=[],expected=1,writer=device){
 return (await db.query(`select road_ready_private.${name}($1::uuid,$2::bigint,$3::jsonb,$4::jsonb) result`,[writer,expected,JSON.stringify(changes),JSON.stringify(deleted)])).rows[0].result;
}
async function saved(){return (await db.query('select revision,payload from public.road_ready_account_workspaces where user_id=$1',[owner])).rows[0];}
async function history(){return (await db.query('select revision,payload from public.road_ready_account_history where user_id=$1 order by revision',[owner])).rows;}
test('patches preserve baseline state, exact history, nulls, removals and untouched records',async()=>{
 const cases=[ [{},[]], [{old:{v:2}},[]], [{new:{v:3}},[]], [{nullable:null},[]], [{old:null},[]], [{new:null},[]], [{old:{v:1}},['second']], [{old:{v:9}},['old','old','missing']], [{new:1},['new']], [{},['missing']], [{empty:[]},[]] ];
 for(const [changes,deleted]of cases){
  await seed(); const before=await patch('baseline_patch',changes,deleted);const expectedState=await saved(),expectedHistory=await history();
  await seed(); const after=await patch('patch_account',changes,deleted);assert.equal(after.revision,before.revision);assert.equal(after.unchanged,before.unchanged);assert.deepEqual(await saved(),expectedState);
  const actual=await history();for(const h of [...actual,...expectedHistory])h.payload.remove.sort();assert.deepEqual(actual,expectedHistory);
  const untouched=(await db.query('select revision,payload from public.road_ready_account_workspaces where user_id=$1',[other])).rows[0];assert.equal(untouched.revision,9);assert.deepEqual(untouched.payload,initial);
 }
});
test('stale revisions are rejected and repeated successful requests cannot replay edits',async()=>{
 await seed();assert.deepEqual(await patch('patch_account',{old:2},[],99),{conflict:true,revision:1});assert.equal((await history()).length,0);
 await patch('patch_account',{old:2});assert.deepEqual(await patch('patch_account',{old:3}),{conflict:true,revision:2});assert.equal((await saved()).payload.records.old,2);assert.equal((await history()).length,1);
});
test('owner approval, synchronization setting, active device, session and handoff guards remain enforced',async()=>{
 for(const sql of ["select set_config('test.uid','',false)","select set_config('test.approved','false',false)",'update public.road_ready_backup_settings set record_sync_enabled=false','update road_ready_private.active_devices set receive_pending=true',`update road_ready_private.active_devices set device_id='${other}'`,'delete from auth.sessions',`select set_config('test.session','${other}',false)`]){
  await seed();await db.exec(sql);await assert.rejects(patch('patch_account',{old:2}),e=>e.code==='42501');assert.equal((await saved()).revision,1);assert.equal((await history()).length,0);
 }
});
test('invalid input cannot write or allocate a revision',async()=>{
 for(const args of [[[],[],1,device],[{},null,1,device],[{},[null],1,device],[{},[{}],1,device],[{},[],0,device],[{},[],1,null]]){
  await seed();await assert.rejects(patch('patch_account',...args));assert.equal((await saved()).revision,1);assert.equal((await history()).length,0);
 }
});
test('the existing 16 MB request and workspace limits remain enforced atomically',async()=>{
 await seed();await assert.rejects(patch('patch_account',{oversize:'x'.repeat(16000001)}),/Invalid account patch/);
 assert.equal((await saved()).revision,1);assert.equal((await history()).length,0);
 await seed({...initial,records:{...initial.records,large:'x'.repeat(15000000)}});
 await assert.rejects(patch('patch_account',{additional:'x'.repeat(1100000)}),/Invalid account records/);
 assert.equal((await saved()).revision,1);assert.equal((await history()).length,0);
});
test('large archives retain exact unrelated records and create a compact replayable delta',async()=>{
 const records=Object.fromEntries(Array.from({length:1500},(_,i)=>['file-'+i,{original:'retained-'+i,metadata:'x'.repeat(7200)}]));
 const payload={...initial,records:{...records,...initial.records}};await seed(payload);
 const start=performance.now();await patch('patch_account',{old:{v:2}});const ms=performance.now()-start;
 const state=await saved();assert.deepEqual(state.payload,{...payload,records:{...payload.records,old:{v:2}}});
 const [delta]=await history();assert.deepEqual(delta.payload.set,{old:{v:2}});assert.deepEqual(delta.payload.remove,[]);assert.equal(delta.payload.meta.seed_snapshot,payload.seed_snapshot);
 console.log('large archive:',JSON.stringify({bytes:JSON.stringify(payload).length,records:Object.keys(payload.records).length,patchMs:Math.round(ms),historyBytes:JSON.stringify(delta).length}));
});
test.after(()=>db.close());
