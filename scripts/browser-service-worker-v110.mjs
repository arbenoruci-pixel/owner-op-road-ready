// Exact emitted worker, synthetic open Driving page, explicit activation handshake.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { chromium, webkit } from 'playwright';
import { traceGeometry } from '../source/src/modules/graph/graphGeometryV110.js';
assert.deepEqual(traceGeometry([{id:'a',status:'OFF',startMin:0,endMin:60},{id:'b',status:'ON',startMin:10,endMin:20},{id:'c',status:'D',startMin:30,endMin:40}]).discontinuities,[{type:'Overlap',start:10,end:20},{type:'Overlap',start:30,end:40}]);
console.log('PASS — nested overlaps never invent coverage gaps');
const current=fs.readFileSync('public/sw.js','utf8');
const manifest=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
const VERSION=manifest.version,BUILD=manifest.build;
assert.equal(manifest.force,false);assert.ok(current.includes(`OWNER_OP_SW_VERSION = '${VERSION}'`));assert.ok(current.includes(`OWNER_OP_SW_BUILD = '${BUILD}'`));
const results=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]])for(const [priorVersion,priorBuild] of [['110.1.0','v110100-module-isolation'],['110.2.0','v110200-logbook-editor'],['110.2.1','v110201-logbook-followup'],['110.2.2','v110202-compact-handles'],['110.2.3','v110203-motive-override-chips'],['110.2.4','v110204-live-continuity-compact']]){
 if(priorVersion===VERSION)continue;
 const prior=current.replace(`'${VERSION}'`,`'${priorVersion}'`).replace(`'${BUILD}'`,`'${priorBuild}'`);
 let worker=prior;
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url.startsWith('/sw.js')){res.setHeader('Content-Type','application/javascript');res.end(worker);}
  else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><title>Synthetic worker upgrade</title><body>Driving fixture stays open</body></html>');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`,browser=await type.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.evaluate(async()=>{
   window.fixtureBoot='unchanged';localStorage.setItem('sw-driving-fixture',JSON.stringify({currentStatus:'D',eventId:'fixture-live',startMin:915,endMin:916}));
   await new Promise((resolve,reject)=>{const r=indexedDB.open('sw-driving-fixture-v110',1);r.onupgradeneeded=()=>r.result.createObjectStore('logs');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('logs','readwrite');tx.objectStore('logs').put({status:'D',startMin:915,endMin:916},'live');tx.oncomplete=()=>{db.close();resolve();};};});
   await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});await navigator.serviceWorker.ready;
  });
  const version=async()=>page.evaluate(()=>new Promise(resolve=>{
   const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('message',receive);resolve(null);},1500);
   function receive(event){if(event.data?.type==='OWNER_OP_SW_VERSION'){clearTimeout(timer);navigator.serviceWorker.removeEventListener('message',receive);resolve(event.data);}}
   navigator.serviceWorker.addEventListener('message',receive);navigator.serviceWorker.controller?.postMessage({type:'OWNER_OP_GET_SW_VERSION'});
  }));
  async function waitVersion(expected){
   const deadline=Date.now()+30000,observed=[];let attempt=0;
   while(Date.now()<deadline){const result=await version();observed.push(result);if(result?.version===expected)return result;if(++attempt%4===0)await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();r?.waiting?.postMessage({type:'OWNER_OP_ACTIVATE_UPDATE'});await r?.update();});await page.waitForTimeout(250);}
   const registration=await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return {active:r?.active?.state,waiting:r?.waiting?.state,installing:r?.installing?.state,controller:navigator.serviceWorker.controller?.scriptURL};});
   fs.mkdirSync('browser-test-results',{recursive:true});fs.writeFileSync('browser-test-results/worker-failure.json',JSON.stringify({name,expected,observed,registration},null,2));throw Error(name+': worker version did not become '+expected);
  }
  const before=await waitVersion(priorVersion);worker=current;await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  const after=await waitVersion(VERSION);assert.equal(after.build,BUILD);
  const snapshot=await page.evaluate(async()=>({boot:window.fixtureBoot,local:JSON.parse(localStorage.getItem('sw-driving-fixture')),stored:await new Promise((resolve,reject)=>{const r=indexedDB.open('sw-driving-fixture-v110');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('logs').objectStore('logs').get('live');q.onsuccess=()=>{db.close();resolve(q.result);};};})}));
  assert.equal(snapshot.boot,'unchanged');assert.deepEqual(snapshot.local,{currentStatus:'D',eventId:'fixture-live',startMin:915,endMin:916});assert.deepEqual(snapshot.stored,{status:'D',startMin:915,endMin:916});assert.deepEqual(errors,[]);
  results.push({browser:name,before,after,activationProtocol:'OWNER_OP_ACTIVATE_UPDATE',noPageReload:true,indexedDBUnchanged:true,localStorageUnchanged:true,pageErrors:errors});console.log('PASS — '+name+': '+priorVersion+' → '+VERSION+' worker handshake; no reload or Driving data change');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
fs.mkdirSync('browser-test-results',{recursive:true});fs.writeFileSync('browser-test-results/service-worker-upgrade.json',JSON.stringify(results,null,2));
