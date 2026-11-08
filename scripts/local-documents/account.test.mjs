import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as core from '../../lib/owner-op-cloud/accountCoreV110455.js';
import * as policy from '../../lib/documents/localOriginalPolicy.js';
import * as files from '../../lib/owner-op-cloud/accountFilesV110455.js';
import {archiveChanged,statusTransition} from '../../lib/owner-op-cloud/syncSnapshotReliability.js';
import {sameSyncState,retainSyncNavigation} from '../../lib/owner-op-cloud/inspectionSyncState.js';
import {createSyncPacer} from '../background-sync/pacing.js';
import {hashBytes} from '../v110450/mirrorCore.js';
const key=(...p)=>JSON.stringify(p);
async function fixture({remoteDocs=true,failure=false}={}){
 const uid='00000000-0000-4000-8000-000000000001',events=[],calls=[],names={app_snapshots:'key',sync_meta:'key',account_receive_staging:'key',...core.TABLE_KEYS};
 const memory=Object.fromEntries(Object.keys(names).map(name=>[name,new Map()]));
 const tables=Object.fromEntries(Object.entries(names).map(([name,pk])=>[name,{name,hook(){},get:async k=>structuredClone(memory[name].get(k)),put:async row=>memory[name].set(row[pk],structuredClone(row)),delete:async k=>memory[name].delete(k),toArray:async()=>structuredClone([...memory[name].values()]),toCollection:()=>({primaryKeys:async()=>[...memory[name].keys()]}),where:field=>({equals:value=>({delete:async()=>{for(const [k,row]of memory[name])if(row[field]===value)memory[name].delete(k);}})})}]));
 const db={...tables,tables:Object.values(tables),name:'local-original-fixture',table:name=>tables[name],transaction:async(...args)=>args.at(-1)()};
 const business={documents:[{id:'business-doc',localDocumentId:'doc',loadNo:'123',title:'Local BOL metadata'}]};
 const local=new Map([['owner-op-account-data-owner-v1',uid],['business',JSON.stringify(business)]]);
 const state={activeDriverId:'driver',unit:'228',eventsByDay:{'2026-11-07':[{id:'off',status:'OFF',startMin:0,endMin:1440}]},certifyStatus:{'2026-11-07':'signed'},dotWallet:{documents:{license:{attachmentDataUrl:'data:application/pdf;base64,bG9jYWw='}}}};
 const originalTables={documents_local:[{local_id:'doc',client_document_id:'client',title:'Local BOL'}],document_blobs:[{local_blob_id:'blob',client_document_id:'client',blob:new Blob(['local original'])}],capture_asset_blobs:[{local_asset_id:'capture',blob:new Blob(['camera original'])}],document_links_local:[{local_id:'link',document_local_id:'doc',load_no:'123'}]};
 for(const [name,rows]of Object.entries(originalTables))for(const row of rows)await db.table(name).put(row);
 const appKey='owner-op-road-ready-state-v1';await db.app_snapshots.put({key:appKey,state});
 const baseRecords=core.recordsFrom({state,business,tables:originalTables}),remote=core.recordsFrom({state:{...state,unit:'229'}});
 // The cloud owns different historical original references; preserve these even
 // when the phone has a newer local original or the cloud row is absent.
 const cloudWallet={documents:{license:{__rrAccountFile:1,kind:'DataURL',chunks:[{sha256:'cloud-only',bytes:10}]}}};
 if(remoteDocs){remote[key('state','dotWallet')]=cloudWallet;remote[key('table','document_blobs','blob')]={local_blob_id:'blob',blob:{__rrAccountFile:1,kind:'Blob',chunks:[{sha256:'different-cloud',bytes:100}]}};}
 else delete remote[key('state','dotWallet')];
 let workspace={revision:25,payload:{format:core.FORMAT,records:remote}},network=0;
 const storage={upload:async()=>{network++;throw Error('Unexpected file upload');},download:async()=>{network++;throw Error('Unexpected file download');}};
 const client={storage:{from:()=>storage},rpc:async(name,args)=>{calls.push({name,args});if(failure)return{error:{message:'HTTP 402 storage quota'}};
  if(name==='road_ready_account_patch_v1'){Object.assign(workspace.payload.records,args.p_patch);for(const k of args.p_deleted)delete workspace.payload.records[k];return{data:{revision:++workspace.revision}};}throw Error('Unexpected cloud write '+name);
 },from:table=>{const q={select:()=>q,eq:()=>q,gt:()=>q,lte:()=>q,order:()=>q,limit:()=>q,maybeSingle:()=>q,single:()=>q,then:(resolve,reject)=>Promise.resolve(failure?{error:{message:'HTTP 402 storage quota'}}:{data:structuredClone(table==='road_ready_backup_settings'?{record_sync_enabled:true}:table==='road_ready_account_workspaces'?workspace:[])}).then(resolve,reject)};return q;}};
 await db.sync_meta.put({key:'account-sync-v110455:base',value:{uid,revision:1,records:baseRecords}});
 // A local unrelated record forces an outgoing patch while unit forces receive.
 state.preference='local';await db.app_snapshots.put({key:appKey,state});
 const context={...core,...files,...policy,originalScopedRecords:core.scopedRecords,originalMergeScope:core.mergeScope,sameSyncState,retainSyncNavigation,archiveChanged,statusTransition,hashBytes,createSyncPacer:o=>createSyncPacer({...o,wait:async()=>{}}),finalizePendingPodPromotions:async()=>{},Dexie:{on(){}},BroadcastChannel:undefined,assertActiveDevice:async()=>({active:true,uid,sid:'local',generation:2}),HANDOFF_KEY:'handoff',acknowledgeHandoff:async()=>{},cloudClient:()=>client,cloudSession:async()=>({user:{id:uid}}),getOwnerOpDb:()=>db,APP_STATE_KEY:appKey,flushAppSnapshots:async()=>{},BUSINESS_STORE_KEY:'business',BUSINESS_STORE_EVENT:'business-event',bounded:async p=>p,window:{dispatchEvent:e=>events.push(e.detail)},document:{visibilityState:'visible'},navigator:{onLine:true},localStorage:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)}};
 // The wrappers in the production module deliberately shadow these two imports.
 delete context.scopedRecords;delete context.mergeScope;
 const code=fs.readFileSync('lib/owner-op-cloud/accountSyncV110455.js','utf8').replace(/^import[^\n]*\n/gm,'').replace(/\bexport /g,'');
 const runtime=new Function(...Object.keys(context),code+';return {syncAccount};')(...Object.values(context));
 return {...runtime,db,appKey,business,local,state:structuredClone(state),originalTables,calls,remoteBefore:structuredClone(remote),remoteAfter:()=>workspace.payload.records,network:()=>network};
}
for(const remoteDocs of [false,true])test(`actual account receive preserves local originals and cloud references (cloud originals ${remoteDocs?'present':'absent'})`,async()=>{
 const f=await fixture({remoteDocs}),r=await f.syncAccount({scope:'all'});assert.equal(r.error,undefined);assert.equal(r.changed,true);assert.equal(f.network(),0);assert.deepEqual(JSON.parse(f.local.get('business')),f.business);
 const state=(await f.db.app_snapshots.get(f.appKey)).state;
 assert.deepEqual(state.dotWallet,f.state.dotWallet);assert.deepEqual(state.eventsByDay,f.state.eventsByDay);assert.deepEqual(state.certifyStatus,f.state.certifyStatus);assert.equal(state.unit,'229');
 for(const [name,rows]of Object.entries(f.originalTables))assert.deepEqual(await f.db.table(name).toArray(),rows);
 for(const call of f.calls){assert.equal(call.name,'road_ready_account_patch_v1');assert.ok(Object.entries(call.args.p_patch).every(([k,v])=>!policy.isDocumentRecord(k,v)));assert.ok(call.args.p_deleted.every(k=>!policy.isDocumentRecord(k,f.remoteBefore[k])));}
 for(const [k,v]of Object.entries(f.remoteBefore))if(policy.isDocumentRecord(k,v))assert.deepEqual(f.remoteAfter()[k],v);
});
test('402 during background sync leaves all original files and logbooks untouched',async()=>{
 const f=await fixture({failure:true}),r=await f.syncAccount({scope:'all'});assert.match(r.error,/402/);assert.deepEqual((await f.db.app_snapshots.get(f.appKey)).state,f.state);
 for(const [name,rows]of Object.entries(f.originalTables))assert.deepEqual(await f.db.table(name).toArray(),rows);assert.equal(f.network(),0);
});
