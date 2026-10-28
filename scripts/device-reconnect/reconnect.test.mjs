import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');
await swc.loadBindings();
const clientCode=fs.readFileSync('scripts/device-reconnect/deviceSession.js','utf8').replace(/^import .*;\n/gm,'').replace(/export (async )?function /g,'$1function ' ).replace(/export const /g,'const ');
const gateSource=fs.readFileSync('scripts/device-reconnect/DeviceSessionGate.jsx','utf8').replace(/^import .*;\n/gm,'').replace('export default function','function');
const gateCode=(await swc.transform(gateSource,{filename:'DeviceSessionGate.jsx',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'es6'}})).code;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
class Events{
 listeners=new Map();addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 dispatchEvent(event){for(const fn of [...(this.listeners.get(event.type)||[])])fn(event);}
}
async function setup(){
 const window=new Events(),document=new Events(),navigator={onLine:true};document.visibilityState='visible';document.activeElement=null;
 let now=1000,id=0;const timers=new Map(),memory=new Map(),meta=new Map(),snapshots=[],signouts=[],calls=[],effects=[];
 const timer=(fn,delay,interval=false)=>{const key=++id;timers.set(key,{fn,at:now+delay,delay,interval});return key;};
 const token=s=>'header.'+btoa(JSON.stringify({session_id:s}))+'.signature';
 let session={user:{id:'test-owner'},access_token:token('test-session')},rpc=()=>Promise.resolve({data:{active:true,generation:1,receive:false}}),getSession=()=>Promise.resolve(session);
 const db={sync_meta:{get:async key=>meta.get(key),put:async row=>{meta.set(row.key,row);}},app_snapshots:{put:async row=>snapshots.push(row)}};
 const cloud={rpc:(name,args)=>{
  const call={name,args,aborted:false};calls.push(call);let signal;
  const builder={abortSignal:value=>{signal=value;signal.addEventListener('abort',()=>{call.aborted=true;});return builder;},then:(resolve,reject)=>Promise.resolve(rpc(name,args)).then(resolve,reject)};return builder;
 },auth:{signOut:async args=>{signouts.push(args);return{};}}};
 let slots=[],cursor=0,tree,mounted=false,cleanup;
 const React={createElement:(type,props,...children)=>({type,props:{...props,children:children.length===1?children[0]:children}}),Fragment:'fragment',
  useState:initial=>{const n=cursor++;if(!(n in slots))slots[n]=typeof initial==='function'?initial():initial;return[slots[n],v=>{slots[n]=typeof v==='function'?v(slots[n]):v;}];},useEffect:fn=>{if(!mounted)effects.push(fn);}};
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const context={CURRENT_APP_VERSION:'test-release',window,document,navigator,React,useState:React.useState,useEffect:React.useEffect,localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
  cloudClient:()=>cloud,cloudSession:()=>getSession(),getOwnerOpDb:()=>db,flushAppSnapshots:async()=>{},structuredClone,crypto:{randomUUID:()=> 'test-device'},atob,btoa,AbortController,Date:ClockDate,
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},setTimeout:(fn,ms)=>timer(fn,ms),clearTimeout:key=>timers.delete(key),setInterval:(fn,ms)=>timer(fn,ms,true),clearInterval:key=>timers.delete(key)};
 window.__rrAccountState=()=>({eventsByDay:{'2026-10-28':[{id:'retained-original',status:'SB'}]}});
 vm.createContext(context);vm.runInContext(clientCode+'\nglobalThis.api={verifyDeviceSession,invalidateDeviceSession,deviceSessionStatus,assertActiveDevice,HANDOFF_KEY};',context);
 vm.runInContext(gateCode+'\nglobalThis.Gate=DeviceSessionGate;',context);
 const render=()=>{cursor=0;tree=context.Gate({children:{type:'button',props:{children:'Edit log'}}});mounted=true;return tree;};
 const flush=async()=>{for(let n=0;n<25;n++)await Promise.resolve();render();};
 const advance=async ms=>{const end=now+ms;for(;;){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;if(next[1].interval)next[1].at+=next[1].delay;else timers.delete(next[0]);next[1].fn();await flush();}now=end;await flush();};
 const nodes=()=>{const out=[];function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}out.push(n);walk(n.props?.children);}walk(tree);return out;};
 render();for(const fn of effects)cleanup=fn();await flush();
 return{context,window,document,navigator,calls,signouts,snapshots,meta,advance,flush,api:context.api,
  rpc:fn=>{rpc=fn;},sessionGetter:fn=>{getSession=fn;},changeSession:s=>{session={...session,access_token:token(s)};},
  locked:()=>nodes().some(n=>n.props?.role==='alert'),message:()=>JSON.stringify(tree,(k,v)=>typeof v==='function'?undefined:v),
  wrapper:()=>nodes().find(n=>n.type==='div'&&n.props.onClickCapture),
  async visibility(state){document.visibilityState=state;document.dispatchEvent({type:'visibilitychange'});await flush();},
  async offline(){navigator.onLine=false;window.dispatchEvent({type:'offline'});await flush();},
  async online(){navigator.onLine=true;window.dispatchEvent({type:'online'});await flush();},
  async retry(){nodes().find(n=>n.type==='button'&&n.props.children==='Retry connection').props.onClick();await flush();},
  cleanup:()=>cleanup?.()};
}
test('verified foreground heartbeat permits access and uses one request at a time',async()=>{
 const f=await setup();assert.equal(f.locked(),false);assert.equal(f.calls.length,1);
 const held=deferred();f.rpc(()=>held.promise);await f.advance(4000);await f.advance(8000);assert.equal(f.calls.length,2);
 held.resolve({data:{active:true,generation:1,receive:false}});await f.flush();assert.equal(f.locked(),false);f.cleanup();
});
test('background suspends checks, cancels the old request and rejects its late revoked response after a fresh foreground check',async()=>{
 const f=await setup(),old=deferred();f.rpc(()=>old.promise);await f.advance(4000);const abandoned=f.calls.at(-1);
 await f.visibility('hidden');await f.advance(60000);assert.equal(abandoned.aborted,true);assert.equal(f.calls.length,2);assert.equal(f.locked(),true);
 f.rpc(()=>({data:{active:true,generation:1,receive:false}}));await f.visibility('visible');assert.equal(f.locked(),false);assert.equal(f.calls.length,3);
 old.resolve({data:{active:false}});await f.flush();assert.equal(f.signouts.length,0);assert.equal(f.api.deviceSessionStatus().active,true);f.cleanup();
});
test('pagehide invalidates cached permission and pageshow starts fresh authorization',async()=>{
 const f=await setup();f.window.dispatchEvent({type:'pagehide'});await f.flush();assert.equal(f.api.deviceSessionStatus(),null);assert.equal(f.locked(),true);
 f.window.dispatchEvent({type:'pageshow'});await f.flush();assert.equal(f.calls.length,2);assert.equal(f.locked(),false);f.cleanup();
});
test('a real timeout cancels transport, retains locked controls and can recover through Retry connection',async()=>{
 const f=await setup(),held=deferred();f.rpc(()=>held.promise);await f.advance(4000);await f.advance(30001);
 assert.equal(f.locked(),true);assert.equal(f.calls.at(-1).aborted,true);assert.match(f.message(),/Device connection check timed out/);assert.equal(f.signouts.length,0);
 f.rpc(()=>({data:{active:true,generation:1,receive:false}}));await f.retry();assert.equal(f.locked(),false);
 held.resolve({data:{active:false}});await f.flush();assert.equal(f.signouts.length,0);f.cleanup();
});
test('a cellular check taking longer than the old ten-second deadline can complete without a false timeout',async()=>{
 const f=await setup(),held=deferred();f.rpc(()=>held.promise);await f.advance(4000);await f.advance(12000);
 assert.equal(f.locked(),false);assert.equal(f.calls.at(-1).aborted,false);
 held.resolve({data:{active:true,generation:1,receive:false}});await f.flush();assert.equal(f.locked(),false);f.cleanup();
});
test('cached write authorization still expires after four seconds and waits for fresh verification',async()=>{
 const f=await setup(),held=deferred();f.rpc(()=>held.promise);await f.advance(4001);let returned=false;
 const auth=f.api.assertActiveDevice().then(()=>{returned=true;});await f.flush();assert.equal(returned,false);
 held.resolve({data:{active:true,generation:1,receive:false}});await auth;assert.equal(returned,true);f.cleanup();
});
test('the post-response session read has a deadline and cannot wedge all future checks',async()=>{
 const f=await setup(),held=deferred();let reads=0;const original=f.context.cloudSession;
 f.sessionGetter(()=>++reads===2?held.promise:Promise.resolve({user:{id:'test-owner'},access_token:'header.'+btoa(JSON.stringify({session_id:'test-session'}))+'.signature'}));
 await f.advance(4000);await f.advance(10001);assert.equal(f.locked(),true);assert.match(f.message(),/Secure session recheck timed out/);
 await f.retry();assert.equal(f.locked(),false);held.resolve(null);await f.flush();assert.equal(f.signouts.length,0);f.cleanup();
});
test('offline immediately locks controls and reconnect requires a fresh server result',async()=>{
 const f=await setup();await f.offline();assert.equal(f.locked(),true);assert.equal(f.api.deviceSessionStatus(),null);
 const wrapper=f.wrapper();assert.ok(wrapper,'the app remains mounted while locked');let prevented=0,stopped=0;
 for(const key of ['onClickCapture','onKeyDownCapture','onKeyUpCapture','onSubmitCapture'])wrapper.props[key]({preventDefault:()=>prevented++,stopPropagation:()=>stopped++});
 assert.equal(prevented,4);assert.equal(stopped,4);
 const held=deferred();f.rpc(()=>held.promise);await f.online();assert.equal(f.locked(),true);
 held.resolve({data:{active:true,generation:1,receive:false}});await f.flush();assert.equal(f.locked(),false);f.cleanup();
});
test('an authoritative revocation preserves the local snapshot and signs out only this device',async()=>{
 const f=await setup();f.rpc(()=>({data:{active:false}}));await f.advance(4000);
 assert.equal(f.locked(),true);assert.equal(f.signouts.length,1);assert.equal(f.signouts[0].scope,'local');assert.equal(f.snapshots[0].state.eventsByDay['2026-10-28'][0].id,'retained-original');f.cleanup();
});
test('an old response for a different session cannot revoke a newer sign-in',async()=>{
 const f=await setup(),held=deferred();f.rpc(()=>held.promise);await f.advance(4000);f.changeSession('new-session');held.resolve({data:{active:false}});await f.flush();
 assert.equal(f.signouts.length,0);assert.equal(f.locked(),true);assert.match(f.message(),/session changed/);f.cleanup();
});
test('handoff intent is persisted before opening and a stale finally cannot clear a newer request',async()=>{
 const f=await setup(),held=deferred();f.rpc(()=>held.promise);await f.advance(4000);f.api.invalidateDeviceSession();
 f.rpc(()=>({data:{active:true,generation:2,receive:true}}));const fresh=f.api.verifyDeviceSession();assert.equal(f.api.verifyDeviceSession(),fresh);await fresh;await f.flush();
 assert.equal(f.meta.get(f.api.HANDOFF_KEY).value.generation,2);held.resolve({data:{active:false}});await f.flush();assert.equal(f.api.deviceSessionStatus().generation,2);assert.equal(f.signouts.length,0);f.cleanup();
});
test('a server response older than the retained handoff cannot downgrade it or reopen the app',async()=>{
 const f=await setup();f.meta.set(f.api.HANDOFF_KEY,{value:{uid:'test-owner',generation:3,records:true,archive:true}});
 f.rpc(()=>({data:{active:true,generation:2,receive:true}}));await f.advance(4000);
 assert.equal(f.locked(),true);assert.equal(f.meta.get(f.api.HANDOFF_KEY).value.generation,3);assert.match(f.message(),/handoff changed/);f.cleanup();
});
