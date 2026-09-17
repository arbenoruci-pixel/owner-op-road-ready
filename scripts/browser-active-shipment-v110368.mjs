// Compiled-app integration: synthetic browser records only; external account APIs are intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output='browser-test-results/active-shipment-v110368';fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000023',email:'override-fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
function sessionAt(clock){const exp=Math.floor(new Date(clock).getTime()/1000)+86400;return {access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};}
import {sequenceFixture} from './v110368/fixture.mjs';
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Willowbrook',state:'IL',source:'manual',note:'',description:'',reasons:[],...extra});
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state);};q.onerror=()=>reject(q.error);};}));}
async function waitState(page,condition){for(let n=0;n<100;n++){const s=await stored(page);if(s&&condition(s))return s;await page.waitForTimeout(100);}throw Error('Override fixture persistence timeout');}
async function openLog(page){await page.locator('.drive-mode-log-btn, .logbook-ui-v110 .log-graph-v110').first().waitFor({timeout:30000});if(await page.locator('.drive-mode-log-btn').isVisible())await page.locator('.drive-mode-log-btn').click();await page.locator('.logbook-ui-v110 .log-graph-v110').waitFor();}
async function setup(page,context,state,clock='2026-09-10T12:15:00Z'){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});assert.equal(route.request().method(),'GET','browser override test cannot send app writes');return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic override test: external access blocked'},headers});});
 await page.clock.setFixedTime(new Date(clock));
 await page.goto(origin+'/_not-found');await page.evaluate(async({schemas,state,session})=>{localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const [name,schema]of Object.entries(schemas)){const [key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{schemas,state,session:sessionAt(clock)});await page.goto(origin);await openLog(page);
}

const section = (page, name) => page.getByRole('navigation',{name:'Log sections'}).getByRole('button',{name,exact:true});
const eventRow = (page, id) => page.locator('[data-log-event-id="'+id+'"]');

const reports=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'Europe/Vienna',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{errors.push(d.message());await d.dismiss();});
 try{
  const state=sequenceFixture();await setup(page,context,state,'2026-09-19T14:00:00Z');
  await eventRow(page,'drive').waitFor();const before=await stored(page);
  for(const id of ['overnight','sleep','pretrip','drive']){
   const meta=await eventRow(page,id).locator('.event-route-meta').innerText();
   assert.match(meta,/BOL 8494.*Trailer 511865/);assert.equal((meta.match(/BOL /g)||[]).length,1);
   assert.doesNotMatch(meta,/97155|001|324|L827217|16060|Trailer 904/);
  }
  assert.equal(await eventRow(page,'empty').locator('.event-route-meta').count(),0,'unlinked recorded drop ends carryover');
  await page.screenshot({path:`${output}/${name}-current-load-only.png`,fullPage:true});
  await section(page,'Form').click();
  const form=await page.locator('.route-leg-item').allTextContents();
  assert.ok(form.some(t=>t.includes('BOL 8494')));assert.ok(form.every(t=>! /BOL (97155|001|324)\b/.test(t)));
  await page.getByRole('button',{name:'‹ Day',exact:true}).click();await section(page,'Log').click();
  await eventRow(page,'before-8494').waitFor();
  assert.match(await eventRow(page,'before-8494').locator('.event-route-meta').innerText(),/BOL 324/);
  const after=await eventRow(page,'after-8494').locator('.event-route-meta').innerText();assert.match(after,/BOL 8494/);assert.equal((after.match(/BOL /g)||[]).length,1);
  await page.getByRole('button',{name:'‹ Day',exact:true}).click();await eventRow(page,'before-324').waitFor();
  assert.match(await eventRow(page,'before-324').locator('.event-route-meta').innerText(),/BOL 001/);
  assert.match(await eventRow(page,'after-324').locator('.event-route-meta').innerText(),/BOL 324/);
  await page.reload();await openLog(page);await section(page,'Log').click();
  assert.match(await eventRow(page,'after-324').locator('.event-route-meta').innerText(),/BOL 324/);
  const saved=await stored(page);
  for(const key of ['eventsByDay','signatureByDay','routeLegsByDay'])assert.deepEqual(saved[key],before[key],'read-only navigation/reload preserves '+key);
  assert.deepEqual(errors,[]);reports.push({browser:name,passed:true});console.log(`PASS — ${name}: four stale loads, only current shipment, exact pickup/drop boundaries, Form, past days and unchanged records after reload`);
 }catch(error){await page.screenshot({path:`${output}/${name}-FAILED.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${name}-state.json`,JSON.stringify(await stored(page).catch(()=>null),null,2));reports.push({browser:name,passed:false,error:String(error),stack:error.stack,errors});console.error(error);}
 finally{await context.close();await browser.close();}
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports.filter(r=>!r.passed)));
