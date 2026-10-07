import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';

// Real IndexedDB/Dexie and production sync/export modules; all cloud I/O is synthetic.
const modules = new Map([
 ['/lib/owner-op-cloud/accountSyncV110455.js', 'scripts/v110455/accountSync.js'],
 ['/lib/owner-op-cloud/accountCoreV110455.js', 'scripts/v110455/accountCore.js'],
 ['/lib/owner-op-cloud/accountFilesV110455.js', 'scripts/v110455/accountFiles.js'],
 ['/lib/owner-op-cloud/mirrorCoreV110450.js', 'scripts/v110450/mirrorCore.js'],
]);
const stubs = new Map([
 ['/lib/owner-op-cloud/client.js', 'export const cloudClient=()=>window.fixture.cloud; export const cloudSession=async()=>window.fixture.session;'],
 ['/lib/local-db/dexie.js', "export const OWNER_OP_DB_NAME='synthetic-receive'; export const getOwnerOpDb=()=>window.fixture.db;"],
 ['/lib/local-db/appState.js', "export const APP_STATE_KEY='owner-op-road-ready-state-v1'; export const flushAppSnapshots=async()=>{};"],
 ['/source/src/modules/business/businessStore.js', "export const BUSINESS_STORE_KEY='owner-op-road-ready-business-v1', BUSINESS_STORE_EVENT='owner-op-business-updated';"],
]);
const root = process.cwd();
const server = http.createServer((req,res)=>{
 const url = new URL(req.url,'http://localhost');
 if(url.pathname==='/')return res.end('<!doctype html><script type="importmap">{"imports":{"dexie":"/node_modules/dexie/dist/dexie.mjs"}}</script>');
 const file = path.resolve(root,modules.get(url.pathname)||'.'+url.pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(404);return res.end();}
 try{res.setHeader('Content-Type','text/javascript');res.end(stubs.get(url.pathname)??fs.readFileSync(file));}
 catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const failures=[];
async function scenario(name,run){
 const context=await browser.newContext();
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();
 try{
  await page.goto(origin);
  await page.evaluate(async()=>{
   const {default:Dexie}=await import('dexie');
   const core=await import('/lib/owner-op-cloud/accountCoreV110455.js');
   const {installBinaryStorage}=await import('/scripts/v110458/binaryStorage.js');
   const db=new Dexie('synthetic-receive');
   db.version(1).stores({app_snapshots:'&key',sync_meta:'&key',account_receive_staging:'&key,user_id',...Object.fromEntries(Object.entries(core.TABLE_KEYS).map(([name,key])=>[name,'&'+key]))});
   installBinaryStorage(db,Dexie);await db.open();
   const f=window.fixture={db,core,uid:'00000000-0000-4000-8000-000000000001',workspace:null,fail:null,calls:[],objects:new Map(),downloads:new Map(),brokenPath:null};
   f.session={user:{id:f.uid}};
   f.storage={
    upload:async(key,bytes)=>{f.objects.set(key,new Blob([bytes]));return {};},
    download:async key=>{f.downloads.set(key,(f.downloads.get(key)||0)+1);return key===f.brokenPath?{error:Error('Synthetic interrupted download')}:{data:f.objects.get(key)};},
   };
   f.cloud={storage:{from:()=>f.storage},rpc:async()=>{throw Error('Unexpected cloud write');},from:table=>{
    let columns;
    const query={select:v=>{columns=v;return query;},eq:()=>query,gt:()=>query,lte:()=>query,order:()=>query,limit:()=>query,maybeSingle:()=>query,single:()=>query,then:(resolve,reject)=>{
     const step=table+':'+columns;f.calls.push(step);
     if(f.fail===step)return Promise.resolve({error:Error('Synthetic failure: '+step)}).then(resolve,reject);
     const data=table==='road_ready_backup_settings'?{record_sync_enabled:true}:table==='road_ready_account_workspaces'?f.workspace:table==='road_ready_account_history'?[]:columns==='*'?null:[{id:'synthetic-snapshot',summary:{events:1}}];
     return Promise.resolve({data}).then(resolve,reject);
    }};return query;
   }};
   f.state={eventsByDay:{'2026-10-07':[{id:'synthetic-event',status:'OFF',startMin:0,endMin:60}]}};
   f.key='owner-op-road-ready-state-v1';
   await db.app_snapshots.put({key:f.key,state:{}});
   f.sync=await import('/lib/owner-op-cloud/accountSyncV110455.js');
  });
  await run(page);
  console.log('PASS '+name);
 }catch(error){failures.push(name+': '+error.message);console.error('FAIL '+name+': '+error.message);}
 finally{await context.close();}
}
try{
 for(const step of [
  'road_ready_backup_settings:record_sync_enabled',
  'road_ready_account_workspaces:revision,device_id,updated_at',
  'road_ready_account_history:revision,payload',
  'road_ready_account_workspaces:*',
  'road_ready_backup_snapshots:id,device_id,created_at,summary:review->summary',
  'road_ready_backup_snapshots:*',
 ])await scenario('local records remain available during '+step,async page=>{
  const result=await page.evaluate(async step=>{
   const f=window.fixture;await f.db.app_snapshots.put({key:f.key,state:f.state});
   if(step.startsWith('road_ready_account_history')){
    await f.db.sync_meta.put({key:'account-sync-v110455:base',value:{uid:f.uid,revision:1,records:{}}});
    f.workspace={revision:2,payload:{format:f.core.FORMAT,records:{}}};
   }else if(step==='road_ready_account_workspaces:*')f.workspace={revision:1,payload:{format:f.core.FORMAT,records:{}}};
   f.fail=step;const result=await f.sync.syncAccount({initial:true});
   return {result,state:(await f.db.app_snapshots.get(f.key)).state,expected:f.state,calls:f.calls};
  },step);
  assert.match(result.result.error,/Synthetic failure/);assert.equal(result.result.canOpenLocal,true);
  assert.deepEqual(result.state,result.expected);assert.ok(result.calls.includes(step));
 });
 await scenario('empty device stays blocked and account mismatch stays protected',async page=>{
  const result=await page.evaluate(async()=>{
   const f=window.fixture;f.fail='road_ready_backup_settings:record_sync_enabled';
   const empty=await f.sync.syncAccount({initial:true});
   await f.db.app_snapshots.put({key:f.key,state:f.state});localStorage.setItem('owner-op-account-data-owner-v1','another-user');
   const mismatch=await f.sync.syncAccount({initial:true});return {empty,mismatch,phase:f.sync.accountStatus().phase};
  });
  assert.equal(result.empty.canOpenLocal,false);assert.equal(result.mismatch.blocked,true);assert.equal(result.phase,'account_mismatch');
 });
 for(const change of ['changed','removed'])await scenario('interrupted receive with remote record '+change,async page=>{
  const result=await page.evaluate(async change=>{
   const f=window.fixture,{encode}=await import('/lib/owner-op-cloud/accountFilesV110455.js');
   const records=f.core.recordsFrom({state:f.state});
   const tableKey=id=>JSON.stringify(['table','document_blobs',id]);
   for(const id of ['stale','reused','blocked'])records[tableKey(id)]=await encode({local_blob_id:id,blob:new Blob([id+' original'],{type:'application/pdf'})},{storage:f.storage,uid:f.uid});
   const pathFor=id=>f.uid+'/temporary-backup/'+records[tableKey(id)].blob.chunks[0].sha256+'.bin';
   const reusedPath=pathFor('reused');f.brokenPath=pathFor('blocked');
   f.workspace={revision:1,payload:{format:f.core.FORMAT,records}};
   await f.db.account_receive_staging.put({key:'other-user-checkpoint',user_id:'other-user',decoded:{blob:new Blob(['other'])}});
   const interrupted=await f.sync.syncAccount({initial:true});
   const checkpoints=await f.db.account_receive_staging.where('user_id').equals(f.uid).primaryKeys();
   const downloads=f.downloads.get(reusedPath),before=(await f.db.app_snapshots.get(f.key)).state;
   if(change==='changed')records[tableKey('stale')]=await encode({local_blob_id:'stale',blob:new Blob(['replacement'],{type:'application/pdf'})},{storage:f.storage,uid:f.uid});
   else delete records[tableKey('stale')];
   f.workspace.revision++;f.brokenPath=null;
   // Abort after the installation has written all records and attempted cleanup.
   const failBase=(_key,row)=>{if(row.key==='account-sync-v110455:base')throw Error('Synthetic install abort');};
   f.db.sync_meta.hook('creating',failBase);
   const aborted=await f.sync.syncAccount({initial:true});f.db.sync_meta.hook('creating').unsubscribe(failBase);
   const afterAbort=await f.db.account_receive_staging.where('user_id').equals(f.uid).primaryKeys();
   const installedAfterAbort=await f.db.document_blobs.count();
   const retried=await f.sync.syncAccount({initial:true});
   const stale=await f.db.document_blobs.get('stale');
   return {interrupted,checkpoints,before,aborted,afterAbort,installedAfterAbort,retried,remaining:await f.db.account_receive_staging.where('user_id').equals(f.uid).count(),other:!!await f.db.account_receive_staging.get('other-user-checkpoint'),reusedDownloads:f.downloads.get(reusedPath),downloads,staleText:stale?await stale.blob.text():null,installed:await f.db.document_blobs.count()};
  },change);
  assert.match(result.interrupted.error,/interrupted download/);assert.equal(result.interrupted.canOpenLocal,false);
  assert.equal(result.checkpoints.length,2);assert.deepEqual(result.before,{});
  assert.match(result.aborted.error,/Synthetic install abort/);assert.equal(result.installedAfterAbort,0);
  for(const key of result.checkpoints)assert.ok(result.afterAbort.includes(key),'Rollback must preserve earlier checkpoints');
  assert.equal(result.retried.error,undefined);assert.equal(result.remaining,0);assert.equal(result.other,true);
  assert.equal(result.reusedDownloads,result.downloads,'Unchanged checkpoint must resume without another download');
  assert.equal(result.staleText,change==='changed'?'replacement':null);assert.equal(result.installed,change==='changed'?3:2);
 });
 await scenario('safety, full JSON and ZIP exports exclude staging without reading it',async page=>{
  const result=await page.evaluate(async()=>{
   const f=window.fixture;
   await f.db.app_snapshots.put({key:f.key,state:f.state});
   await f.db.document_blobs.put({local_blob_id:'saved',blob:new Blob(['saved original'],{type:'application/pdf'})});
   await f.db.account_receive_staging.put({key:'transport-only',user_id:f.uid,decoded:{blob:new Blob(['staging secret'])}});
   const {buildDeviceSafetyArchive,buildDeviceSafetyInventory}=await import('/lib/local-db/safetyArchive.js');
   const {buildLargeBackup,inspectLargeBackup}=await import('/scripts/v110431/largeBackup.js');
   const {decoratePortableArchiveV110429}=await import('/scripts/v110429/portableBackup.js');
   // Exporting must never materialize the staging blobs, even for inventory.
   const nativeGetAll=IDBObjectStore.prototype.getAll,nativeCursor=IDBObjectStore.prototype.openCursor;
   for(const [method,native] of [['getAll',nativeGetAll],['openCursor',nativeCursor]])IDBObjectStore.prototype[method]=function(...args){if(this.name==='account_receive_staging')throw Error('Export read transport staging');return native.apply(this,args);};
   const inventory=await buildDeviceSafetyInventory(f.state,{});
   const safety=await buildDeviceSafetyArchive({state:f.state});
   const portable=await decoratePortableArchiveV110429(safety.archive);
   const zip=await buildLargeBackup({state:f.state,inventory});
   const checked=await inspectLargeBackup(zip.file);
   return {inventory,safety:safety.archive.payload.dexie,portable:portable.payload.dexie,zip:checked.archive.payload.dexie,valid:safety.verification.ok,remaining:await f.db.account_receive_staging.count()};
  });
  for(const tables of [result.inventory.dexieTables,result.safety,result.portable,result.zip])assert.equal('account_receive_staging' in tables,false);
  assert.equal(result.valid,true);assert.equal(result.remaining,1);assert.equal(result.safety.document_blobs.length,1);assert.equal(result.zip.document_blobs.length,1);
 });
 assert.deepEqual(failures,[]);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
