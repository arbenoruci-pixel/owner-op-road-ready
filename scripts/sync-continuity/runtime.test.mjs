import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as core from '../v110455/accountCore.js';
import {statusTransition} from '../../lib/owner-op-cloud/syncSnapshotReliability.js';
const code=fs.readFileSync('lib/owner-op-cloud/accountSyncV110455.js','utf8').replace(/^import .*;\n/gm,'').replace(/\bexport /g,'');
function fixture({owner='owner',handoff=false,journal=false,revoked=false}={}){
 const events=[],writes=[],memory=new Map([['owner-op-account-data-owner-v1',owner]]),meta=new Map();
 const state={activeDriverId:'driver',eventsByDay:{'2026-10-29':[{id:'saved-duty',status:'OFF',startMin:0,endMin:60}]}};
 if(handoff)meta.set('handoff',{value:{uid:'owner',generation:1,records:true,archive:true}});
 if(journal)meta.set('account-sync-v110455:pending',{value:{uid:'owner',oldBusiness:{loads:[]},oldLocals:{}}});
 const db={sync_meta:{get:async k=>meta.get(k),put:async row=>meta.set(row.key,row),delete:async k=>{writes.push('journal-cleared');meta.delete(k);},toCollection:()=>({primaryKeys:async()=>[]})},app_snapshots:{get:async()=>({state}),put:async()=>{}},table:()=>({hook:()=>{}})};
 let hold,settingsStarted=false;
 const held=new Promise(r=>{hold=r;});const query={select:()=>query,eq:()=>query,maybeSingle:()=>{settingsStarted=true;return held;}};
 const context={...core,statusTransition,BroadcastChannel:undefined,document:{visibilityState:"visible"},cloudClient:()=>({from:()=>query}),cloudSession:async()=>({user:{id:'owner'}}),getOwnerOpDb:()=>db,
 assertActiveDevice:async()=>{if(revoked)throw Object.assign(Error('revoked'),{deviceRevoked:true});return{active:true,uid:'owner',sid:'session',generation:1};},
 HANDOFF_KEY:'handoff',APP_STATE_KEY:'state',BUSINESS_STORE_KEY:'business',BUSINESS_STORE_EVENT:'business-event',Dexie:{on:()=>{}},
 window:{dispatchEvent:e=>{events.push(e.detail);if(e.detail?.phase==='local_ready')writes.push('local-ready');}},navigator:{onLine:true},
 localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
 flushAppSnapshots:async()=>{writes.push('captured');},bounded:async p=>p,CustomEvent:class{constructor(type,v){this.type=type;this.detail=v.detail;}},structuredClone,crypto:{randomUUID:()=> 'device'}};
 const runtime=new Function(...Object.keys(context),code+'\nreturn {syncAccount};')(...Object.values(context));
 return{events,writes,run:()=>runtime.syncAccount({initial:true,scope:'records'}),settingsStarted:()=>settingsStarted,release:()=>hold({error:Error('fixture-cloud-unavailable')})};
}
test('owned local logbook becomes ready before a slow cloud request finishes',async()=>{
 const f=fixture(),pending=f.run();for(let i=0;i<50;i++)await Promise.resolve();
 assert.equal(f.settingsStarted(),true,JSON.stringify(f.events));assert.deepEqual(f.events.find(e=>e.localReady)?.localReady,{uid:'owner',sid:'session',generation:1});
 assert.deepEqual(f.writes,['captured','local-ready']);f.release();assert.equal((await pending).canOpenLocal,true);
});
test('pending journal is recovered before local readiness is published',async()=>{
 const f=fixture({journal:true}),p=f.run();for(let i=0;i<50;i++)await Promise.resolve();
 assert.deepEqual(f.writes,['journal-cleared','captured','local-ready']);f.release();await p;
});
test('another account, revoked device and unfinished receive never publish local readiness',async()=>{
 for(const opts of [{owner:'other-owner'},{revoked:true},{handoff:true}]){
  const f=fixture(opts),p=f.run();for(let i=0;i<60;i++)await Promise.resolve();f.release();await p;
  assert.equal(f.events.some(e=>e.localReady),false,JSON.stringify(opts));
 }
});
test('gate accepts only the freshly captured current device identity and generation',()=>{
 const source=fs.readFileSync('source/src/modules/cloud/AccountSyncGateV110455.jsx','utf8');
 const body=source.slice(source.indexOf('const update = event =>'),source.indexOf('    const openDetails ='));
 assert.ok(body.includes('local_ready'));
 for(const change of [{},{sid:'old-session'},{uid:'other-owner'},{generation:2},{active:false},{receive:true}]){
  let ready=false;const device={uid:'owner',sid:'session',generation:1,active:true,receive:false,...change};
  const update=new Function('deviceSessionStatus','setReady','setStatus',body+'return update;')(()=>device,v=>{ready=v;},()=>{});
  update({detail:{phase:'local_ready',localReady:{uid:'owner',sid:'session',generation:1}}});assert.equal(ready,Object.keys(change).length===0);
 }
});
