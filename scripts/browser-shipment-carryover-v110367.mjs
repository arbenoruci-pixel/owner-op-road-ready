// Compiled-app integration: synthetic browser records only; external account APIs are intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output='browser-test-results/shipment-carryover-v110367';fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000023',email:'override-fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
import {fixture, guideFixture, pickupDay, middleDay, deliveryDay} from './v110367/fixture.mjs';
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Willowbrook',state:'IL',source:'manual',note:'',description:'',reasons:[],...extra});
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state);};q.onerror=()=>reject(q.error);};}));}
async function waitState(page,condition){for(let n=0;n<100;n++){const s=await stored(page);if(s&&condition(s))return s;await page.waitForTimeout(100);}throw Error('Override fixture persistence timeout');}
async function openLog(page){await page.locator('.drive-mode-log-btn, .logbook-ui-v110 .log-graph-v110').first().waitFor({timeout:30000});if(await page.locator('.drive-mode-log-btn').isVisible())await page.locator('.drive-mode-log-btn').click();await page.locator('.logbook-ui-v110 .log-graph-v110').waitFor();}
async function setup(page,context,state,clock='2026-09-10T12:15:00Z'){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});assert.equal(route.request().method(),'GET','browser override test cannot send app writes');return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic override test: external access blocked'},headers});});
 await page.clock.setFixedTime(new Date(clock));
 await page.goto(origin+'/_not-found');await page.evaluate(async({schemas,state,session})=>{localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const [name,schema]of Object.entries(schemas)){const [key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{schemas,state,session});await page.goto(origin);await openLog(page);
}

const section = (page, name) => page.getByRole('navigation',{name:'Log sections'}).getByRole('button',{name,exact:true});
const eventRow = (page, id) => page.locator('[data-log-event-id="'+id+'"]');
const reports=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 for(const completed of [false,true]){
  const scenario=completed?'delivered':'open';
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'Europe/Vienna',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async d=>{errors.push('Unexpected dialog: '+d.message());await d.dismiss();});
  try {
   const state=fixture();state.manualMilesByDay={[middleDay]:744};
   if(!completed){
    Object.assign(state.routeLegsByDay[pickupDay][0],{status:'open',deliveryDay:'',deliveryEventId:'',deliveryMin:null});
    state.eventsByDay[deliveryDay]=[{...state.eventsByDay[deliveryDay][0],id:'open-day',endMin:1440}];
   }
   await setup(page,context,state,'2026-09-18T14:00:00Z');
   await eventRow(page,'driving').waitFor();
   for(const id of ['overnight','sleeper','pretrip','driving','break']){
    const meta=eventRow(page,id).locator('.event-route-meta');
    assert.match(await meta.innerText(),/BOL 123.*Trailer UNIT-A.*Going to New York, NY/);
   }
   const before=await stored(page);
   const intervals=s=>Object.fromEntries(Object.entries(s.eventsByDay).map(([day,rows])=>[day,rows.map(({id,status,startMin,endMin})=>({id,status,startMin,endMin}))]));
   await page.screenshot({path:`${output}/${name}-${scenario}-events.png`,fullPage:true});
   await section(page,'Form').click();
   const route=page.locator('.route-leg-item').filter({hasText:'BOL 123'});
   assert.equal(await route.count(),1);
   assert.match(await route.innerText(),/Chicago, IL.*New York, NY/s);
   assert.match(await route.innerText(),/In transit/);
   const shipping=page.locator('.road-form-row').filter({hasText:'Shipping Documents'});
   assert.match(await shipping.innerText(),/123/);
   await page.screenshot({path:`${output}/${name}-${scenario}-form.png`,fullPage:true});
   await page.getByRole('button',{name:'Day ›',exact:true}).click();
   await section(page,'Log').click();
   if(completed){
    await eventRow(page,'after-delivery').waitFor();
    assert.match(await eventRow(page,'before-delivery').locator('.event-route-meta').innerText(),/BOL 123/);
    assert.equal(await eventRow(page,'after-delivery').locator('.event-route-meta').count(),0);
    await section(page,'Form').click();
    assert.match(await page.locator('.route-leg-item').filter({hasText:'BOL 123'}).innerText(),/Done/);
    await page.getByRole('button',{name:'Day ›',exact:true}).click();
    await section(page,'Form').click();
    assert.equal(await page.locator('.route-leg-item').filter({hasText:'BOL 123'}).count(),0);
    await page.getByRole('button',{name:'‹ Day',exact:true}).click();
   }
   await page.getByRole('button',{name:'‹ Day',exact:true}).click();
   await page.reload();await openLog(page);await section(page,'Log').click();
   assert.match(await eventRow(page,'driving').locator('.event-route-meta').innerText(),/BOL 123.*Trailer UNIT-A/);
   const after=await stored(page);
   assert.deepEqual(intervals(after),intervals(before),'viewing and reloading preserve every duty interval');
   assert.deepEqual(after.signatureByDay,before.signatureByDay,'viewing preserves signatures');
   assert.equal(after.manualMilesByDay[middleDay],744);
   assert.ok(Object.values(after.eventsByDay).flat().every(row=>!Object.hasOwn(row,'shipmentContextV110367')),'read-only context never enters persistent records');
   assert.deepEqual(errors,[]);
   reports.push({browser:name,scenario,passed:true});
   console.log(`PASS — ${name} ${scenario}: all statuses, day Form, delivery boundary, history and reload`);
  }catch(error){
   await page.screenshot({path:`${output}/${name}-${scenario}-FAILED.png`,fullPage:true}).catch(()=>{});
   fs.writeFileSync(`${output}/${name}-${scenario}-state.json`,JSON.stringify(await stored(page).catch(()=>null),null,2));
   reports.push({browser:name,scenario,passed:false,error:String(error),stack:error.stack,errors});console.error(error);
  }finally{await context.close();}
 }

 for (const betweenStops of [false,true]) {
  const scenario=betweenStops?'between-guide-stops':'overdue-guide';
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Vienna',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
   const state=guideFixture({firstDelivered:betweenStops,finalDelivered:betweenStops});
   state.activeDay=betweenStops?deliveryDay:'2026-09-17';
   await setup(page,context,state,'2026-09-19T14:00:00Z');
   const id=betweenStops?'after-delivery':'next-day',destination=betweenStops?'Boston, MA':'New York, NY';
   const text=await eventRow(page,id).locator('.event-route-meta').innerText();
   assert.ok(text.includes('BOL 123')&&text.includes('Trailer UNIT-A')&&text.includes('Going to '+destination),text);
   if(betweenStops){
    assert.match(await eventRow(page,'before-delivery').locator('.event-route-meta').innerText(),/Going to New York, NY/);
    await page.getByRole('button',{name:'Day ›',exact:true}).click();
    await section(page,'Log').click();
    assert.match(await eventRow(page,'before-final').locator('.event-route-meta').innerText(),/Going to Boston, MA/);
    assert.equal(await eventRow(page,'after-final').locator('.event-route-meta').count(),0);
   }
   await page.screenshot({path:`${output}/${name}-${scenario}.png`,fullPage:true});
   await page.reload();await openLog(page);
   if(betweenStops)assert.equal(await eventRow(page,'after-final').locator('.event-route-meta').count(),0);
   else assert.match(await eventRow(page,'next-day').locator('.event-route-meta').innerText(),/Going to New York, NY/);
   const saved=await stored(page);
   assert.ok(Object.values(saved.eventsByDay).flat().every(row=>!Object.hasOwn(row,'shipmentContextV110367')));
   assert.deepEqual(errors,[]);reports.push({browser:name,scenario,passed:true});
   console.log(`PASS — ${name} ${scenario}: real guide shape, actual deliveries, inherited pickup and reload`);
  }catch(error){
   await page.screenshot({path:`${output}/${name}-${scenario}-FAILED.png`,fullPage:true}).catch(()=>{});
   fs.writeFileSync(`${output}/${name}-${scenario}-state.json`,JSON.stringify(await stored(page).catch(()=>null),null,2));
   reports.push({browser:name,scenario,passed:false,error:String(error),stack:error.stack,errors});console.error(error);
  }finally{await context.close();}
 }
 await browser.close();
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));
assert.ok(reports.every(r=>r.passed),JSON.stringify(reports.filter(r=>!r.passed)));
