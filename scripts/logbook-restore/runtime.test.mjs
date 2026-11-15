import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as core from './core.js';import {canonical} from '../v110455/accountCore.js';import {fixture} from './fixture.mjs';
async function runtimeFixture(){
 const f=await fixture(),data={app_snapshots:new Map(),sync_meta:new Map()},now='2026-11-15T12:00:00Z';let live=structuredClone(f.current),request=structuredClone(f.request),fail=false,applies=0;
 const table=name=>({get:async k=>structuredClone(data[name].get(k)),put:async row=>{data[name].set(row.key,structuredClone(row));},toCollection:()=>({primaryKeys:async()=>[...data[name].keys()]})});
 const db={app_snapshots:table('app_snapshots'),sync_meta:table('sync_meta'),transaction:async(...args)=>{const old=structuredClone(data);try{return await args.at(-1)();}catch(e){data.app_snapshots=old.app_snapshots;data.sync_meta=old.sync_meta;throw e;}}};
 const key='owner-op-road-ready-state-v1';await db.app_snapshots.put({key,state:f.current,updated_at:now});await db.sync_meta.put({key:'single-device-before-handoff:9',value:{uid:f.context.uid,state:f.original},updated_at:now});
 const query=()=>{let patch=null;const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,single:()=>q,update:v=>{patch=v;return q;},then:(resolve,reject)=>{
  if(patch&&fail)return Promise.resolve({error:Error('receipt offline')}).then(resolve,reject);
  if(patch)request={...request,...patch};return Promise.resolve({data:structuredClone(request)}).then(resolve,reject);
 }};return q;};
 const lockState={editorBusy:false};
 const context={...core,canonical,cloudClient:()=>({from:query}),cloudSession:async()=>({user:{id:f.context.uid}}),assertActiveDevice:async()=>({uid:f.context.uid,generation:9}),deviceId:()=>f.context.deviceId,HANDOFF_KEY:'handoff',accountStatus:()=>({phase:'idle'}),getOwnerOpDb:()=>db,APP_STATE_KEY:key,flushAppSnapshots:async()=>{},bounded:async p=>p,
 navigator:{onLine:true,locks:{request:async(name,options,fn)=>(fn||options)(lockState.editorBusy&&name==='road-ready-record-editor-v1'?null:{name})}},document:{visibilityState:'visible',activeElement:null},window:{__rrAccountState:()=>live,dispatchEvent:e=>{if(e.type==='road-ready-account-apply'){live=structuredClone(e.detail);applies++;}}},localStorage:{getItem:()=>f.context.uid},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},Date:class extends Date{constructor(...args){super(...(args.length?args:['2026-11-15T20:00:00Z']));}},Intl};
 const source=fs.readFileSync('scripts/logbook-restore/runtime.js','utf8').replace(/^import[^\n]*\n/gm,'').replace(/\bexport /g,'');
 const api=new Function(...Object.keys(context),source+'\nreturn {restoreAuthorizedLogbook};')(...Object.values(context));
 return {...f,...api,db,key,lockState,get live(){return live;},get request(){return request;},get applies(){return applies;},failReceipt:v=>{fail=v;}};
}
test('coordinator atomically stores pre-restore checkpoint and verifies original bytes before acknowledgement',async()=>{
 const f=await runtimeFixture(),out=await f.restoreAuthorizedLogbook(f.request);
 assert.equal(out.status,'applied');assert.equal(f.request.status,'applied');assert.equal(f.applies,1);
 assert.deepEqual((await f.db.app_snapshots.get('authorized-logbook-recovery:request:before')).state,f.current);
 for(const day of f.days)assert.deepEqual(core.dayValue(f.live,'driver_primary',day),core.dayValue(f.original,'driver_primary',day));
 assert.deepEqual(f.live.eventsByDay['2026-11-15'],f.current.eventsByDay['2026-11-15']);
});
test('lost cloud acknowledgement resumes from durable receipt without applying a second restore',async()=>{
 const f=await runtimeFixture();f.failReceipt(true);
 await assert.rejects(f.restoreAuthorizedLogbook(f.request),/receipt offline/);assert.equal(f.applies,1);assert.equal(f.request.status,'pending');
 f.failReceipt(false);assert.equal((await f.restoreAuthorizedLogbook(f.request)).status,'applied');assert.equal(f.applies,1);
});
test('active handoff defers recovery; missing originals and changed dates cause no writes',async()=>{
 const f=await runtimeFixture();await f.db.sync_meta.put({key:'handoff',value:{uid:f.context.uid,records:true}});
 assert.equal((await f.restoreAuthorizedLogbook(f.request)).deferred,true);assert.equal(f.applies,0);
 await f.db.sync_meta.put({key:'handoff',value:{uid:f.context.uid,records:false}});
 await f.db.sync_meta.put({key:'single-device-before-handoff:9',value:{uid:'foreign',state:f.original}});
 await assert.rejects(f.restoreAuthorizedLogbook(f.request),/not yet found/);assert.deepEqual((await f.db.app_snapshots.get(f.key)).state,f.current);assert.equal(f.applies,0);
});
test('another open logbook keeps its editor lock and blocks recovery until the editor closes',async()=>{
 const f=await runtimeFixture();f.lockState.editorBusy=true;
 assert.equal((await f.restoreAuthorizedLogbook(f.request)).deferred,true);assert.equal(f.applies,0);assert.deepEqual((await f.db.app_snapshots.get(f.key)).state,f.current);
 f.lockState.editorBusy=false;assert.equal((await f.restoreAuthorizedLogbook(f.request)).status,'applied');assert.equal(f.applies,1);
});
