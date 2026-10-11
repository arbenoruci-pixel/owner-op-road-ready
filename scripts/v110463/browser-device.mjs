import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';
const require=createRequire(import.meta.url),swc=require('next/dist/build/swc');
await swc.loadBindings();
const jsx=fs.readFileSync('scripts/v110463/DeviceSessionGate.jsx','utf8').replace("import React,{useEffect,useState} from 'react';","const React=window.React,{useEffect,useState}=React;");
const gate=(await swc.transform(jsx,{filename:'DeviceSessionGate.jsx',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'es6'}})).code;
const root=process.cwd(),stubs=new Map([
 ['/source/src/modules/auth/DeviceSessionGateV110463.jsx',gate],
 ['/lib/owner-op-cloud/deviceSessionV110463.js',fs.readFileSync('scripts/v110463/deviceSession.js','utf8')],
 ['/lib/owner-op-cloud/mirrorCoreV110450.js',fs.readFileSync('scripts/v110450/mirrorCore.js','utf8')],
 ['/lib/owner-op-cloud/client.js','export const cloudClient=()=>window.fixture.cloud;export const cloudSession=async()=>window.fixture.session;'],
 ['/lib/local-db/dexie.js','export const getOwnerOpDb=()=>window.fixture.db;'],
 ['/lib/local-db/appState.js','export const flushAppSnapshots=async()=>{window.fixture.flushed++;};'],
]);
let owner='ipad-session',generation=1;const used=new Set(['ipad-session']);
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/rpc'){
  let body='';for await(const b of req)body+=b;
  const {sid,name,params}=JSON.parse(body);let data;
  if(name==='road_ready_active_device_v1'){
   if(sid!==owner&&params.p_takeover&&!used.has(sid)){owner=sid;generation++;used.add(sid);}
   data={active:sid===owner,generation,receive:sid===owner&&generation>1};
  }else data={active:sid===owner};
  res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({data}));
 }
 if(url.pathname==='/')return res.end('<!doctype html><div id="root"></div><script src="/node_modules/react/umd/react.development.js"></script><script src="/node_modules/react-dom/umd/react-dom.development.js"></script>');
 const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.writeHead(404);return res.end();}
 try{res.setHeader('Content-Type','text/javascript');res.end(stubs.get(url.pathname)??fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await(process.env.SYNC_TEST_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
async function client(sid,takeover=false){
 const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 const page=await context.newPage();await page.goto(origin);
 await page.evaluate(async({sid,takeover})=>{
  const {default:Dexie}=await import('/node_modules/dexie/dist/dexie.mjs');const db=new Dexie('single-device-test');db.version(1).stores({sync_meta:'&key',app_snapshots:'&key'});await db.open();
  const session={user:{id:'test-user'},access_token:'header.'+btoa(JSON.stringify({session_id:sid}))+'.signature'};
  const f=window.fixture={session,db,flushed:0,signouts:[],clicked:0};
  f.cloud={rpc:async(name,params)=>fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,params,sid})}).then(r=>r.json()),auth:{signOut:async options=>{f.signouts.push(options);f.session=null;return {};}}};
  window.__rrAccountState=()=>({eventsByDay:{'2026-10-10':[{id:'unsent-ipad-event'}]}});
  const mod=await import('/lib/owner-op-cloud/deviceSessionV110463.js');if(takeover)mod.requestDeviceActivation(session);
  f.mod=mod;const {default:Gate}=await import('/source/src/modules/auth/DeviceSessionGateV110463.jsx');
  window.ReactDOM.createRoot(document.getElementById('root')).render(window.React.createElement(Gate,null,window.React.createElement('button',{id:'edit',onClick:()=>f.clicked++},'Edit log')));
 },{sid,takeover});
 return {context,page};
}
try{
 const ipad=await client('ipad-session');await ipad.page.getByRole('button',{name:'Edit log'}).click();
 await ipad.context.setOffline(true);await ipad.page.getByText(/Offline. Reconnect/).waitFor();
 assert.equal(await ipad.page.locator('#edit').evaluate(el=>el.closest('[inert]')!==null),true);
 const phone=await client('phone-session',true);await phone.page.getByRole('button',{name:'Edit log'}).click();
 const handoff=await phone.page.evaluate(async()=>{const f=window.fixture;return (await f.db.sync_meta.get(f.mod.HANDOFF_KEY)).value;});
 assert.equal(handoff.records,true);assert.equal(handoff.archive,true);assert.equal(handoff.generation,2);
 await ipad.context.setOffline(false);await ipad.page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await ipad.page.waitForFunction(()=>window.fixture.signouts.length===1);
 const old=await ipad.page.evaluate(async()=>({signouts:window.fixture.signouts,flushed:window.fixture.flushed,snapshots:await window.fixture.db.app_snapshots.toArray()}));
 assert.deepEqual(old.signouts,[{scope:'local'}]);assert.ok(old.flushed>0);assert.equal(old.snapshots[0].state.eventsByDay['2026-10-10'][0].id,'unsent-ipad-event');
 await phone.page.getByRole('button',{name:'Edit log'}).click();assert.equal(owner,'phone-session');
 // A stale activation marker is not replayed as a fresh sign-in.
 const replay=await client('ipad-session',true);await replay.page.waitForFunction(()=>window.fixture.signouts.length===1);assert.equal(owner,'phone-session');
 // Persistence survives module re-import without reopening stale local data.
 const again=await phone.page.evaluate(async()=>{const mod=await import('/lib/owner-op-cloud/deviceSessionV110463.js?reload');return mod.verifyDeviceSession();});assert.equal(again.active,true);assert.equal(again.generation,2);
 console.log('PASS browser: two devices, offline lock, takeover, preserved iPad snapshot, local-only signout, revoked-session replay and durable handoff');
}finally{await browser.close();server.close();}
