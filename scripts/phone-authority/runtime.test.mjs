import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import * as core from '../../lib/owner-op-cloud/accountCoreV110455.js';
import {archiveChanged,statusTransition} from '../../lib/owner-op-cloud/syncSnapshotReliability.js';
import {sameSyncState,retainSyncNavigation} from '../../lib/owner-op-cloud/inspectionSyncState.js';
import {createSyncPacer} from '../background-sync/pacing.js';
import {hashBytes,verifiedPiece,objectPath,PART_BYTES} from '../v110450/mirrorCore.js';
const load=(file,context,exports)=>new Function(...Object.keys(context),fs.readFileSync(file,'utf8').replace(/^import[^\n]*\n/gm,'').replace(/\bexport /g,'')+'\nreturn {'+exports+'};')(...Object.values(context));
const files=load('lib/owner-op-cloud/accountFilesV110455.js',{hashBytes,verifiedPiece,objectPath,PART_BYTES,bounded:async p=>p},'encode,decode,piecesOf,snapshotBundle,localPieceSource');
async function fixture(){
 const uid='00000000-0000-4000-8000-000000000001',events=[],downloads=[],waits=[],stored=new Map();let workspace=null,intercept=()=>{},clock=0;
 const names={app_snapshots:'key',sync_meta:'key',account_receive_staging:'key',...core.TABLE_KEYS};
 const memory=Object.fromEntries(Object.keys(names).map(name=>[name,new Map()]));
 const tables=Object.fromEntries(Object.entries(names).map(([name,pk])=>[name,{name,hook(){},
 get:async key=>structuredClone(memory[name].get(key)),put:async row=>{memory[name].set(row[pk],structuredClone(row));},delete:async key=>memory[name].delete(key),
 toArray:async()=>structuredClone([...memory[name].values()]),toCollection:()=>({primaryKeys:async()=>[...memory[name].keys()]}),
 where:field=>({equals:value=>({delete:async()=>{for(const [k,row]of memory[name])if(row[field]===value)memory[name].delete(k);}})})}]));
 const db={...tables,tables:Object.values(tables),name:'synthetic',table:name=>tables[name],transaction:async(...args)=>args.at(-1)()};
 const local=new Map([['owner-op-account-data-owner-v1',uid]]);
 const storage={upload:async(k,bytes)=>{stored.set(k,new Blob([bytes]));return{};},download:async k=>{downloads.push(k);intercept();return{data:stored.get(k)};}};
 const client={storage:{from:()=>storage},rpc:async()=>{throw Error('Unexpected cloud write');},from:table=>{
 const q={select:()=>q,eq:()=>q,gt:()=>q,lte:()=>q,order:()=>q,limit:()=>q,maybeSingle:()=>q,single:()=>q,then:(resolve,reject)=>Promise.resolve({data:structuredClone(table==='road_ready_backup_settings'?{record_sync_enabled:true}:table==='road_ready_account_workspaces'?workspace:[])}).then(resolve,reject)};return q;}};
 const context={...core,...files,sameSyncState,retainSyncNavigation,finalizePendingPodPromotions:async()=>{},archiveChanged,statusTransition,hashBytes,createSyncPacer:opts=>createSyncPacer({...opts,now:()=>clock,wait:async ms=>{waits.push(ms);clock+=ms;}}),
 Dexie:{on(){}},BroadcastChannel:undefined,assertActiveDevice:async()=>({active:true,uid,sid:'synthetic',generation:2}),HANDOFF_KEY:'handoff',acknowledgeHandoff:async()=>{},
 cloudClient:()=>client,cloudSession:async()=>({user:{id:uid}}),getOwnerOpDb:()=>db,APP_STATE_KEY:'owner-op-road-ready-state-v1',flushAppSnapshots:async()=>{},BUSINESS_STORE_KEY:'business',BUSINESS_STORE_EVENT:'business-event',bounded:async p=>p,
 window:{dispatchEvent:e=>events.push(e.detail)},document:{visibilityState:'visible'},navigator:{onLine:true},crypto:webcrypto,
 localStorage:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)},CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts?.detail;}},structuredClone};
 const runtime=load('lib/owner-op-cloud/accountSyncV110455.js',context,'syncAccount,requestRecordPriority');
 const key=context.APP_STATE_KEY,day='2026-11-01',state={activeDriverId:'driver',eventsByDay:{[day]:[{id:'off',status:'OFF',startMin:0,endMin:60}]}};
 await db.app_snapshots.put({key,state});await db.document_blobs.put({local_blob_id:'original',blob:new Blob(['local original'])});
 const original=new Uint8Array(2*PART_BYTES+17);original.fill(137);
 const encoded=await files.encode({local_blob_id:'original',blob:new Blob([original])},{storage,uid,known:new Set()});downloads.length=0;
 workspace={revision:25,payload:{format:core.FORMAT,records:{...core.recordsFrom({state:{...state,eventsByDay:{[day]:[{...state.eventsByDay[day][0],endMin:120}]}}}),'["table","document_blobs","original"]':encoded}}};
 await db.sync_meta.put({key:'handoff',value:{uid,generation:2,records:true,archive:true}});
 return {...runtime,db,key,day,original,downloads,waits,events,intercept:fn=>{intercept=fn;}};
}
test('actual coordinator preserves the active phone before any cloud commit or local install, then permits explicit receive',async()=>{
 const f=await fixture();
 await f.db.sync_meta.delete('handoff');
 const before=structuredClone((await f.db.app_snapshots.get(f.key)).state),records=core.recordsFrom({state:before});
 await f.db.sync_meta.put({key:'account-sync-v110455:base',value:{uid:'00000000-0000-4000-8000-000000000001',revision:24,records,remoteRecords:records}});
 const blocked=await f.syncAccount({initial:true,scope:'records'});
 assert.match(blocked.error,/phone logbook is preserved/);assert.equal(blocked.canOpenLocal,true);
 assert.deepEqual((await f.db.app_snapshots.get(f.key)).state,before);
 assert.equal(f.downloads.length,0);
 await f.db.sync_meta.put({key:'handoff',value:{uid:'00000000-0000-4000-8000-000000000001',generation:2,records:false,archive:true}});
 const unfinished=await f.syncAccount({scope:'records'});
 assert.match(unfinished.error,/phone logbook is preserved/);
 assert.deepEqual((await f.db.app_snapshots.get(f.key)).state,before);
 await f.db.sync_meta.put({key:'handoff',value:{uid:'00000000-0000-4000-8000-000000000001',generation:2,records:true,archive:false}});
 const received=await f.syncAccount({initial:true,scope:'records'});
 assert.equal(received.error,undefined);assert.equal((await f.db.app_snapshots.get(f.key)).state.eventsByDay[f.day][0].endMin,120);
 assert.deepEqual((await f.db.sync_meta.get('single-device-before-handoff:2')).value.state,before);
});

test('explicitly reviewed remote conflict selection remains available without permitting automatic replacement',async()=>{
 const f=await fixture();await f.db.sync_meta.delete('handoff');
 const base=structuredClone((await f.db.app_snapshots.get(f.key)).state),records=core.recordsFrom({state:base}),edited=structuredClone(base);
 edited.eventsByDay[f.day][0].endMin=80;await f.db.app_snapshots.put({key:f.key,state:edited});
 await f.db.sync_meta.put({key:'account-sync-v110455:base',value:{uid:'00000000-0000-4000-8000-000000000001',revision:24,records,remoteRecords:records}});
 const pending=await f.syncAccount({initial:true,scope:'records'});
 assert.equal(pending.conflicts.length,1);assert.equal((await f.db.app_snapshots.get(f.key)).state.eventsByDay[f.day][0].endMin,80);
 const chosen=await f.syncAccount({scope:'records',choices:{[JSON.stringify(['day','driver',f.day])]:'remote'}});
 assert.equal(chosen.error,undefined);assert.equal((await f.db.app_snapshots.get(f.key)).state.eventsByDay[f.day][0].endMin,120);
});
