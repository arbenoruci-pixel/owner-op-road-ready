import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {fixture} from './fixture.mjs';
import {dayValue,digest} from './core.js';
import {baseState,seed,setupRoutes,snapshot,origin} from '../v110434/browserFixture.mjs';
import {fixtureCorsHeaders} from '../test-support/cloud-fixture.mjs';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname));
for(const [name,engine]of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
 try{
  await setupRoutes(context);const f=await fixture(),uid='00000000-0000-4000-8000-000000000029',device='00000000-0000-4000-8000-000000000130';
  let request={...f.request,user_id:uid,device_id:device},enabled=false,receipts=0;
  const unsigned=f.days[1],value=dayValue(f.original,'driver_primary',unsigned),source={userId:uid,deviceId:device};
  request.patch.indexedUnsignedDays={[unsigned]:{value,sha256:await digest(value),source}};
  request.patch.indexedRouteBuckets={};
  for(const day of f.days){const value=f.original.routeLegsByDay[day]||[];request.patch.indexedRouteBuckets[day]={value,sha256:await digest(value),source};}
  const retained=structuredClone(f.original);delete retained.eventsByDay[unsigned];delete retained.routeLegsByDay;
  await context.route('**/rest/v1/road_ready_corrections*',async route=>{
   const headers={...await fixtureCorsHeaders(route.request(),origin),'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'},method=route.request().method(),url=new URL(route.request().url());
   if(method==='OPTIONS')return route.fulfill({headers,body:''});
   if(method==='PATCH'){request={...request,...route.request().postDataJSON()};if(request.status==='applied')receipts++;return route.fulfill({headers,json:{id:request.id}});}
   return route.fulfill({headers,json:url.searchParams.has('id')?request:enabled&&request.status==='pending'?[request]:[]});
  });
  const state={...baseState(),...f.current,testInstructionStore:{loads:[],documents:[],fuel:[],expenses:[],maintenance:[],settlements:[]}};
  await seed(page,state,[]);
  const before=await snapshot(page);
  await page.evaluate(async({uid,device,original})=>{
   localStorage.setItem('owner-op-account-data-owner-v1',uid);localStorage.setItem('owner-op-cloud-mirror-v1:device',device);
   await new Promise((resolve,reject)=>{const q=indexedDB.open('owner-op-road-ready-offline-v1');q.onsuccess=()=>{const db=q.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'single-device-signout:1794733200000',state:original,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};q.onerror=()=>reject(q.error);});
  },{uid,device,original:retained});
  enabled=true;await page.reload();
  await page.waitForFunction(()=>window.__rrAccountState?.()?.signatureByDay?.['2026-11-10']?.signed===true,null,{timeout:90000}).catch(async error=>{console.error('Recovery diagnostics',JSON.stringify({request,url:page.url(),body:await page.locator('body').innerText()}));throw error;});
  for(let i=0;i<30&&request.status!=='applied';i++)await page.waitForTimeout(300);
  assert.equal(request.status,'applied',JSON.stringify(request.result));assert.equal(receipts,1);
  await page.waitForURL(origin+'/',{timeout:15000});await page.waitForFunction(()=>window.__rrAccountState?.()?.signatureByDay?.['2026-11-10']?.signed===true);
  const after=await snapshot(page);
  for(const day of f.days)assert.deepEqual(dayValue(after,'driver_primary',day),dayValue(f.original,'driver_primary',day));
  assert.deepEqual(after.eventsByDay['2026-11-15'],before.eventsByDay['2026-11-15']);
  assert.deepEqual(after.dotWallet,before.dotWallet);
  await page.reload();await page.waitForFunction(()=>window.__rrAccountState?.()?.signatureByDay?.['2026-11-10']?.signed===true);
  assert.equal(receipts,1);assert.deepEqual(dayValue(await snapshot(page),'driver_primary','2026-11-10'),dayValue(f.original,'driver_primary','2026-11-10'));
  console.log('PASS '+name+' — retained signature plus exact unsigned index and routes, today preserved, receipt and reload');
 }finally{await browser.close();}
}
