// Runs against either a loopback build or the public production build. All
// account APIs are intercepted; only synthetic per-browser IndexedDB is written.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium,webkit } from 'playwright';
const origin=process.env.TEST_ORIGIN || 'http://127.0.0.1:3000';
const output=`browser-test-results/followup-${process.env.TEST_ORIGIN?'production':'local'}`;
fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000003',email:'gps-fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const day='2026-09-06',row={id:'live-gps',status:'D',startMin:915,endMin:916,city:'Albany',state:'NY',description:'Original GPS description',note:'Driving',source:'live_status',lat:42.6526,lng:-73.7562,gpsAccuracy:5,locationSource:'manual_gps_lock'};
const state={view:'day',activeDay:day,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'12',trailer:'53'},driverProfile:{name:'Synthetic Driver'},carrierName:'Synthetic Carrier',mainOfficeAddress:'Synthetic Office',currentTrailer:'53',currentStatus:'D',currentLocation:{city:'Albany',state:'NY'},manualDrivingSession:{active:true,status:'D',eventId:row.id,startDay:day,startedAt:'2026-09-06T19:15:00Z',source:'manual_status'},eventsByDay:{[day]:[{id:'off',status:'OFF',startMin:0,endMin:915,city:'Albany',state:'NY',note:'Off Duty'},row]},certifyStatus:{[day]:'Needs signature'},signatureByDay:{},inspectionByDay:{},routeLegsByDay:{},formByDay:{},loadGuidesById:{},dotWallet:{documents:{}}};
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state);};q.onerror=()=>reject(q.error);};}));}
async function waitState(page,predicate){for(let n=0;n<100;n++){const s=await stored(page);if(s&&predicate(s))return s;await page.waitForTimeout(100);}throw Error('GPS fixture persistence timed out');}
async function openLog(page){await page.locator('.drive-mode-log-btn, .logbook-ui-v110 .log-graph-v110').first().waitFor({timeout:30000});if(await page.locator('.drive-mode-log-btn').isVisible())await page.locator('.drive-mode-log-btn').click();await page.locator('[data-log-event-id="live-gps"]').waitFor();}
async function openEdit(page){await page.locator('[data-log-event-id="live-gps"] .blue-edit').click();await page.locator('.editor-ui-v110').waitFor();}
const reports=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Belgrade',colorScheme:'dark',isMobile:true,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block'});const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.clock.setFixedTime(new Date('2026-09-06T21:20:00Z'));
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});assert.equal(route.request().method(),'GET','Production tests must never send writes');return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'External account access blocked in synthetic GPS test'},headers});});
 try{
  await page.goto(origin+'/_not-found');await page.evaluate(async({schemas,state,session})=>{
   localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');
   await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const [name,schema]of Object.entries(schemas)){const [key,...indexes]=schema.split(',').map(s=>s.trim());const store=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');store.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
  },{schemas,state,session});
  await page.goto(origin);await openLog(page);const before=await waitState(page,s=>s.eventsByDay?.[day]?.find(e=>e.id===row.id));
  assert.deepEqual(before.eventsByDay[day],state.eventsByDay[day]);
  await openEdit(page);await page.getByLabel('Location',{exact:true}).focus();await page.getByLabel('Description',{exact:true}).focus();
  assert.equal(await page.locator('.editor-ui-v110 .save-main').isDisabled(),true,'Unchanged focus/blur must not dirty the draft or erase GPS');
  await page.locator('.editor-ui-v110 .note-toggle-v90').click();await page.getByLabel('Notes',{exact:true}).fill('Discard this synthetic note');await page.locator('.cancel-main').click();
  assert.deepEqual((await stored(page)).eventsByDay[day],before.eventsByDay[day]);
  await openEdit(page);await page.getByLabel('Location',{exact:true}).focus();await page.getByLabel('Description',{exact:true}).focus();
  await page.locator('.editor-ui-v110 .note-toggle-v90').click();await page.getByLabel('Notes',{exact:true}).fill('GPS-safe synthetic note');await page.locator('.editor-ui-v110 .save-main').click();
  const saved=await waitState(page,s=>s.eventsByDay?.[day]?.find(e=>e.id===row.id)?.note==='GPS-safe synthetic note');
  assert.deepEqual(saved.eventsByDay[day],before.eventsByDay[day].map(e=>e.id===row.id?{...e,note:'GPS-safe synthetic note'}:e));assert.deepEqual(saved.manualDrivingSession,before.manualDrivingSession);assert.equal(saved.currentStatus,'D');assert.deepEqual(saved.inspectionByDay,before.inspectionByDay);
  await page.reload();await openLog(page);await openEdit(page);assert.match(await page.locator('.selected-duration-live').innerText(),/2h 5m/);assert.equal((await stored(page)).eventsByDay[day].find(e=>e.id===row.id).lat,row.lat);
  await page.screenshot({path:`${output}/${name}-live-gps-editor.png`,fullPage:false});
  await page.getByLabel('Location',{exact:true}).fill('Dayton, OH');await page.getByLabel('Description',{exact:true}).focus();await page.locator('.editor-ui-v110 .save-main').click();
  const edited=await waitState(page,s=>s.eventsByDay?.[day]?.find(e=>e.id===row.id)?.city==='Dayton');const target=edited.eventsByDay[day].find(e=>e.id===row.id);
  assert.equal(target.state,'OH');assert.equal(target.lat,null);assert.equal(target.lng,null);assert.equal(target.locationSource,'manual');assert.equal(target.startMin,915);assert.equal(target.endMin,916);assert.equal(edited.manualDrivingSession.active,true);
  assert.deepEqual(errors,[]);reports.push({browser:name,origin,passed:true,phoneZone:'Europe/Belgrade',terminalZone:'America/New_York',checks:['unchanged focus/blur is not dirty','Cancel preserves exact raw GPS event','note-only Save retains GPS/times/IDs/neighbors/session','reload retains GPS and 2h5m live duration','explicit manual location clears stale GPS without ending Driving'],pageErrors:errors});console.log('PASS — '+name+' GPS-safe note editor on '+origin);
 }catch(error){await page.screenshot({path:`${output}/${name}-FAILED.png`,fullPage:false}).catch(()=>{});reports.push({browser:name,origin,passed:false,error:String(error),pageErrors:errors});console.error(error);}
 finally{await browser.close();}
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports));
