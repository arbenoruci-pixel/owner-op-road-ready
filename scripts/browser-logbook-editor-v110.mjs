// Real browser interaction with isolated, synthetic IndexedDB and network stubs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium,webkit } from 'playwright';
const origin='http://127.0.0.1:3000',at='2026-09-06T21:20:00Z';
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000002',email:'editor-fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Chicago',state:'IL',note:status==='OFF'?'Off Duty':status==='SB'?'Sleeper':status==='D'?'Driving':'Fuel',...extra});
function fixture(live=false){const day=live?'2026-09-06':'2026-07-10';return {view:'day',activeDay:day,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'12',trailer:'53'},driverProfile:{name:'Test Driver'},carrierName:'Test Carrier',mainOfficeAddress:'Test Office',currentTrailer:'53',currentStatus:live?'D':'OFF',currentLocation:{city:'Chicago',state:'IL'},manualDrivingSession:live?{active:true,status:'D',eventId:'live',startDay:day,startedAt:'2026-09-06T19:15:00Z',source:'manual_status'}:null,eventsByDay:{[day]:live?[row('off','OFF',0,900),row('on','ON',900,915),row('live','D',915,916,{source:'live_status',description:'Interstate route note'})]:[row('off','OFF',0,480),row('sleeper','SB',480,900),row('short','ON',915,916,{description:'Fuel detail for the selected event'}),row('drive','D',916,1000),row('finish','ON',1000,1010),row('rest','OFF',1008,1440)]},certifyStatus:{[day]:'Needs signature'},signatureByDay:{},inspectionByDay:{},routeLegsByDay:{},formByDay:{},loadGuidesById:{},dotWallet:{documents:{}}};}
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state);};q.onerror=()=>reject(q.error);};}));}
async function waitState(page,predicate){for(let n=0;n<100;n++){const s=await stored(page);if(s&&predicate(s))return s;await page.waitForTimeout(100);}throw Error('Persistent editor state condition timed out');}
async function seed(page,state,existing=false){await page.goto(origin+'/_not-found');await page.evaluate(async({schemas,state,session,existing})=>{
 localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));
 localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');
 await new Promise((resolve,reject)=>{const request=existing ? indexedDB.open('owner-op-road-ready-offline-v1') : indexedDB.open('owner-op-road-ready-offline-v1',20);request.onupgradeneeded=()=>{const db=request.result;for(const [name,schema] of Object.entries(schemas)){const [key,...indexes]=schema.split(',').map(s=>s.trim());const store=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');store.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
 },{schemas,state,session,existing});await page.goto(origin);await page.locator('.logbook-ui-v110 .log-graph-v110').waitFor();}
function luminance(rgb){const c=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4;});return .2126*c[0]+.7152*c[1]+.0722*c[2];}
async function inspect(page,label){const info=await page.locator('.editor-ui-v110').evaluate(root=>({width:root.clientWidth,scroll:root.scrollWidth,viewport:innerWidth,fields:[...root.querySelectorAll('input:not([type=checkbox])')].filter(el=>el.getBoundingClientRect().width>0).map(el=>{const c=getComputedStyle(el);return {name:el.getAttribute('aria-label')||el.placeholder,color:c.webkitTextFillColor||c.color,background:c.backgroundColor,font:c.fontSize,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right};})}));assert.ok(info.scroll<=info.width+1,label+' editor overflow');for(const field of info.fields){assert.ok(field.left>=-1&&field.right<=info.viewport+1,label+' clipped input '+field.name);assert.ok(parseFloat(field.font)>=16,label+' iPhone input zoom '+field.name);const a=luminance(field.color),b=luminance(field.background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=4.5,`${label} low contrast ${field.name}: ${ratio}`);}return info;}
fs.mkdirSync('browser-test-results',{recursive:true});const results=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]])for(const zone of ['America/Los_Angeles','Europe/Belgrade']){
 const browser=await type.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:zone,colorScheme:'dark',isMobile:true,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[],consoleErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});page.on('dialog',d=>d.accept());
 await page.clock.setFixedTime(new Date(at));
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic browser: external access disabled'},headers});});
 const prefix=`${name}-${zone.replaceAll('/','-')}`;
 try{
  const state=fixture(false),day=state.activeDay;await seed(page,state);
  const before=await waitState(page,s=>s.activeDay===day);
  assert.deepEqual(before.eventsByDay[day],state.eventsByDay[day]);
  assert.ok(await page.locator('.graph-discontinuity[data-kind=Gap]').count());assert.ok(await page.locator('.graph-discontinuity[data-kind=Overlap]').count());
  await page.screenshot({path:`browser-test-results/${prefix}-log.png`,fullPage:true});
  await page.locator('[data-log-event-id=short] .blue-edit').click();
  await page.locator('.editor-ui-v110').waitFor();
  assert.equal(await page.getByLabel('Start time',{exact:true}).inputValue(),'15:15');assert.equal(await page.getByLabel('End time',{exact:true}).inputValue(),'15:16');
  assert.equal((await page.locator('.selected-duration-live b').innerText()).trim(),'1m');assert.match(await page.locator('.selected-duration-live em').innerText(),/3:15 PM.*3:16 PM/);
  assert.match(await page.locator('.editor-timezone-v110').innerText(),/America\/New_York/);
  const closedContrast=await inspect(page,prefix+' closed');await page.screenshot({path:`browser-test-results/${prefix}-closed-editor.png`,fullPage:true});
  await page.getByLabel('End time',{exact:true}).fill('15:17');assert.equal((await page.locator('.selected-duration-live b').innerText()).trim(),'2m');
  await page.locator('.cancel-main').click();await page.waitForTimeout(400);assert.deepEqual((await stored(page)).eventsByDay[day],before.eventsByDay[day]);
  await page.locator('[data-log-event-id=short] .blue-edit').click();await page.getByLabel('End time',{exact:true}).fill('15:17');await page.locator('.save-main').click();
  const saved=await waitState(page,s=>s.eventsByDay[day].find(e=>e.id==='short')?.endMin===917);
  assert.deepEqual(saved.eventsByDay[day].filter(e=>e.id!=='short'),before.eventsByDay[day].filter(e=>e.id!=='short'));
  await page.reload();await page.locator('[data-log-event-id=short] .blue-edit').click();assert.equal(await page.getByLabel('End time',{exact:true}).inputValue(),'15:17');
  await page.getByLabel('End time',{exact:true}).fill('15:14');assert.ok(await page.locator('[role=alert]').count());assert.equal(await page.locator('.save-main').isDisabled(),true);await page.locator('.cancel-main').click();
  await page.locator('[data-log-event-id=rest] .blue-edit').click();assert.equal(await page.locator('.midnight-end-v110 input').isChecked(),true);assert.equal(await page.getByLabel('End time',{exact:true}).inputValue(),'00:00');assert.match(await page.locator('.selected-duration-live em').innerText(),/next day/);await page.locator('.cancel-main').click();
  const live=fixture(true);await seed(page,live,true);await page.locator('[data-log-event-id=live] .blue-edit').waitFor();const liveBefore=await stored(page);
  await page.locator('[data-log-event-id=live] .blue-edit').click();assert.ok(await page.getByLabel('Start time',{exact:true}).isDisabled());assert.match(await page.locator('.live-now-v110').innerText(),/Now.*17:20/);assert.equal((await page.locator('.selected-duration-live b').innerText()).trim(),'2h 5m');
  const liveContrast=await inspect(page,prefix+' live');await page.screenshot({path:`browser-test-results/${prefix}-live-editor.png`,fullPage:true});
  await page.locator('.cancel-main').click();await page.waitForTimeout(400);assert.deepEqual((await stored(page)).eventsByDay[live.activeDay],liveBefore.eventsByDay[live.activeDay]);
  await page.locator('[data-log-event-id=live] .blue-edit').click();await page.locator('.note-toggle-v90').click();await page.getByLabel('Notes',{exact:true}).fill('Live note proof');await page.locator('.save-main').click();
  const liveSaved=await waitState(page,s=>s.eventsByDay[live.activeDay].find(e=>e.id==='live')?.note==='Live note proof');
  assert.equal(liveSaved.currentStatus,'D');assert.deepEqual(liveSaved.manualDrivingSession,liveBefore.manualDrivingSession);
  assert.deepEqual(liveSaved.eventsByDay[live.activeDay].map(e=>({id:e.id,start:e.startMin,end:e.endMin,status:e.status})),liveBefore.eventsByDay[live.activeDay].map(e=>({id:e.id,start:e.startMin,end:e.endMin,status:e.status})));
  await page.reload();await page.locator('[data-log-event-id=live] .blue-edit').click();assert.equal((await page.locator('.selected-duration-live b').innerText()).trim(),'2h 5m');assert.match(await page.locator('.note-toggle-v90').innerText(),/Live note proof/);
  await page.setViewportSize({width:320,height:740});await inspect(page,prefix+' narrow');await page.screenshot({path:`browser-test-results/${prefix}-320px.png`,fullPage:true});
  await page.getByRole('button',{name:'Change status',exact:true}).click();await page.waitForTimeout(250);assert.equal(await page.locator('.editor-ui-v110').count(),0);assert.equal((await stored(page)).currentStatus,'D');
  assert.deepEqual(errors,[]);const unexpected=consoleErrors.filter(s=>!s.includes('Failed to load resource')&&!s.includes('403')&&!s.includes('404'));assert.deepEqual(unexpected,[]);
  results.push({browser:name,phoneTimeZone:zone,homeTimeZone:'America/New_York',closedContrast,liveContrast,checks:'gap/overlap; one-minute draft; Cancel; exact Save; reload; invalid range; 24:00; live Now; note-only Save/reload; explicit status handoff; 320px; no JS exceptions',pageErrors:errors,expectedBlockedResourceErrors:consoleErrors.length});
  console.log('PASS — '+prefix+' real mobile Logbook/editor flows');
 }catch(error){await page.screenshot({path:`browser-test-results/${prefix}-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`browser-test-results/${prefix}-failure.json`,JSON.stringify({message:error.message,errors,consoleErrors,state:await stored(page).catch(()=>null)},null,2));throw error;}finally{await browser.close();}
}
fs.writeFileSync('browser-test-results/logbook-editor-results.json',JSON.stringify(results,null,2));
