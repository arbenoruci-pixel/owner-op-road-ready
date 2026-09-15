// Synthetic data only. Every external request is intercepted; no real account is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
const origin=process.env.TEST_ORIGIN || 'http://127.0.0.1:3000',day='2026-09-14';
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
assert.ok(schemas.app_snapshots && schemas.document_blobs);
const user={id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400;
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const token=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic';
const session={access_token:token,refresh_token:'synthetic-no-real-token',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const state={view:'day',activeDay:day,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/Chicago',driver:{truck:'12',trailer:'53'},driverProfile:{name:'Test Driver'},carrierName:'Test Carrier',mainOfficeAddress:'Test Office',currentTrailer:'53',currentStatus:'OFF',currentLocation:{city:'Chicago',state:'IL'},eventsByDay:{[day]:[{id:'fixture-event',status:'OFF',startMin:0,endMin:1440,city:'Chicago',state:'IL',note:'Off Duty'}]},certifyStatus:{[day]:'Needs signature'},signatureByDay:{},inspectionByDay:{},routeLegsByDay:{},formByDay:{},driverSignature:{dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4WQAAAAASUVORK5CYII=',driverName:'Test Driver'},loadGuidesById:{},dotWallet:{documents:{}}};
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,r=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');r.onerror=()=>{db.close();reject(r.error);};r.onsuccess=()=>{db.close();resolve(r.result?.state);};};}));}
async function waitState(page,predicate){for(let n=0;n<100;n++){const s=await stored(page);if(s && predicate(s))return s;await page.waitForTimeout(100);}throw Error('Persistent state condition timed out');}
const target={id:'pending-route',day:'2026-09-13',pickupDay:day,fromCity:'Dates Delivery Dates',toCity:'Dates',shippingDocs:'38246703',status:'open'};
const other={id:'keep-route',day,pickupDay:day,fromCity:'Downers Grove',fromState:'IL',toCity:'New York',toState:'NY',shippingDocs:'324',status:'open'};
state.routeLegsByDay={[day]:[target,other]};
state.loadInfo={loadNo:'324',shippingDocs:'324',routeLegsByDay:{'2026-09-13':[target]}};
const rows=s=>Object.values(s.routeLegsByDay || {}).flat();
fs.mkdirSync('browser-test-results',{recursive:true});
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Chicago',isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[],dialogs=[];
 page.on('pageerror',e=>errors.push(e.message));
 let acceptDelete=false;
 page.on('dialog',async d=>{dialogs.push(d.message());if(acceptDelete)await d.accept();else await d.dismiss();});
 await page.clock.setFixedTime(new Date('2026-09-15T14:00:00Z'));
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});return route.continue();}
  const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
  if(route.request().method()==='OPTIONS')return route.fulfill({body:'',status:200,headers});
  if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});
  if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});
  if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});
  return route.fulfill({status:403,json:{error:'External requests disabled in synthetic browser test'},headers});
 });
 try{
  await page.goto(origin+'/_not-found');
  await page.evaluate(async({schemas,state,session})=>{
   localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));
   await new Promise((resolve,reject)=>{const request=indexedDB.open('owner-op-road-ready-offline-v1',20);request.onupgradeneeded=()=>{const db=request.result;for(const [name,schema] of Object.entries(schemas)){const [key,...indexes]=schema.split(',').map(s=>s.trim());const store=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');const keyPath=field.startsWith('[')?field.slice(1,-1).split('+'):field;store.createIndex(field,keyPath,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};};});
  },{schemas,state,session});
  await page.goto(origin);
  const form=()=>page.getByRole('navigation',{name:'Log sections'}).getByRole('button',{name:'Form',exact:true});
  await form().click({timeout:30000});
  const pending=()=>page.locator('.route-leg-item').filter({hasText:'Dates Delivery Dates'});
  await pending().first().waitFor();
  const before=await waitState(page,s=>rows(s).some(r=>r.id===target.id));
  // Cancellation must leave the record in both the UI and durable snapshot.
  await pending().first().locator('.route-leg-delete').click();
  assert.ok(rows(await stored(page)).some(r=>r.id===target.id));
  await pending().first().waitFor();
  // A route deletion is local-first and works with the network offline.
  await context.setOffline(true);acceptDelete=true;
  await pending().first().locator('.route-leg-delete').click();
  const removed=await waitState(page,s=>!rows(s).some(r=>r.id===target.id));
  assert.ok(rows(removed).some(r=>r.id===other.id));
  await pending().waitFor({state:'detached'});
  assert.deepEqual(removed.eventsByDay,before.eventsByDay);
  assert.deepEqual(removed.signatureByDay,before.signatureByDay);
  assert.deepEqual(removed.dotWallet,before.dotWallet);
  assert.deepEqual(removed.loadGuidesById,before.loadGuidesById);
  await context.setOffline(false);await page.reload();await form().click({timeout:30000});
  const reloaded=await waitState(page,s=>!rows(s).some(r=>r.id===target.id));
  assert.equal(await pending().count(),0);
  assert.ok(rows(reloaded).some(r=>r.id===other.id));
  assert.deepEqual(reloaded.eventsByDay,before.eventsByDay);
  // Removing the final synthetic row leaves an explicit empty day after reload.
  await page.locator('.route-leg-item').filter({hasText:'Downers Grove'}).locator('.route-leg-delete').click();
  await waitState(page,s=>!rows(s).some(r=>r.id===other.id));
  await page.reload();await form().click({timeout:30000});
  assert.equal(await page.locator('.route-leg-item').count(),0);
  assert.deepEqual((await stored(page)).eventsByDay,before.eventsByDay);
  assert.equal(dialogs.filter(text=>text.startsWith('Delete this route leg?')).length,3);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'browser-test-results/route-delete-'+name+'.png',fullPage:true});
  console.log('PASS — '+name+': cancel, offline Delete, IndexedDB, reload and final-route removal; duty events stay unchanged');
 }catch(error){await page.screenshot({path:'browser-test-results/route-delete-'+name+'-failed.png',fullPage:true}).catch(()=>{});fs.writeFileSync('browser-test-results/route-delete-'+name+'-failure.json',JSON.stringify({error:String(error),errors,dialogs,text:await page.locator('body').innerText()},null,2));throw error;}
 finally{await context.close();await browser.close();}
}
