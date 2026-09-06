// Synthetic data only. Every external request is intercepted; no real account is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
const origin='http://127.0.0.1:3000',day='2026-07-10';
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
fs.mkdirSync('browser-test-results',{recursive:true});
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Chicago',serviceWorkers:'block'});
 const page=await context.newPage(),errors=[],dialogs=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
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
  await page.getByRole('navigation',{name:'Log sections'}).getByRole('button',{name:'Sign',exact:true}).click({timeout:20000});
  await page.locator('.sign-save').click();
  const signed=await waitState(page,s=>s.signatureByDay?.[day]?.certificationContext?.version===1 && s.certifyStatus?.[day]==='Certified');
  assert.equal(signed.eventsByDay[day].length,1);
  await page.reload();
  await page.getByRole('navigation',{name:'Log sections'}).getByRole('button',{name:'Sign',exact:true}).click({timeout:20000});
  assert.match(await page.locator('.sign-status-card').innerText(),/Signed and certified/);
  await page.evaluate(day=>window.dispatchEvent(new CustomEvent('road-ready-document-commit-v105',{detail:{record:{id:'fixture-document',type:'other',title:'Synthetic supporting document',linkDay:day,documentDate:day,status:'filed',verificationStatus:'driver_confirmed'}}})),day);
  const linked=await waitState(page,s=>s.lastDocumentLink?.documentId==='fixture-document');
  assert.deepEqual(linked.eventsByDay[day],signed.eventsByDay[day]);
  assert.deepEqual(linked.signatureByDay[day],signed.signatureByDay[day]);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('road-ready-load-guide-action-v103',{detail:{action:'toggle_done',stepId:'fixture-step'}})));
  const afterLoad=await waitState(page,s=>s.lastLoadGuideActionV108?.stepId==='fixture-step');
  assert.deepEqual(afterLoad.eventsByDay[day],signed.eventsByDay[day]);
  assert.deepEqual(afterLoad.signatureByDay[day],signed.signatureByDay[day]);
  await page.reload();
  await page.getByRole('navigation',{name:'Log sections'}).getByRole('button',{name:'Sign',exact:true}).click({timeout:20000});
  assert.match(await page.locator('.sign-status-card').innerText(),/Signed and certified/);
  assert.equal((await stored(page)).signatureByDay[day].signedAt,signed.signatureByDay[day].signedAt);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'browser-test-results/'+name+'.png',fullPage:true});
  console.log('PASS — '+name+': real sign, durable IndexedDB, reload, document commit and load action preserve the signed log');
 }catch(error){await page.screenshot({path:'browser-test-results/'+name+'-failed.png',fullPage:true}).catch(()=>{});fs.writeFileSync('browser-test-results/'+name+'-failure.json',JSON.stringify({error:String(error),errors,dialogs,text:await page.locator('body').innerText()},null,2));throw error;}
 finally{await context.close();await browser.close();}
}
