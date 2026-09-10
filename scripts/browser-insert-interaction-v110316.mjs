// Compiled-app integration: synthetic browser records only; external account APIs are intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output=`browser-test-results/insert-interaction-${process.env.TEST_ORIGIN?'production':'local'}`;fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000023',email:'override-fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const day='2026-09-09';
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Willowbrook',state:'IL',source:'manual',...extra});
function fixture(status='SB',phone=false) {return {view:'day',activeDay:day,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'TEST',trailer:'TEST'},driverProfile:{name:'Synthetic Driver'},carrierName:'Synthetic Carrier',mainOfficeAddress:'Test Office',currentTrailer:'TEST',currentStatus:status,currentReason:'Keep current',currentLocation:{city:'Harborcreek',state:'PA'},eventsByDay:{[day]:phone?[row('early','D',0,25),row('sleep','SB',25,750),row('pti','ON',750,778),row('target','D',778,1321,{source:'gps_drive',note:'Driving started'}),row('live','SB',1321,1322,{source:'live_status',note:'Keep current'})]:[row('earlier',status==='OFF'?'SB':'OFF',0,1321),row('target',status,1321,1322,{source:'live_status',note:'Keep current'})]},...(status==='D'?{manualDrivingSession:{active:true,eventId:'target',startDay:day}}:{}),certifyStatus:{[day]:'Needs signature'},signatureByDay:{'2026-09-08':{signed:true}},inspectionByDay:{},routeLegsByDay:{},formByDay:{},loadGuidesById:{},dotWallet:{documents:{}}};}
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state);};q.onerror=()=>reject(q.error);};}));}
async function waitState(page,condition){for(let n=0;n<100;n++){const s=await stored(page);if(s&&condition(s))return s;await page.waitForTimeout(100);}throw Error('Override fixture persistence timeout');}
async function openLog(page){await page.locator('.drive-mode-log-btn, .logbook-ui-v110 .log-graph-v110').first().waitFor({timeout:30000});if(await page.locator('.drive-mode-log-btn').isVisible())await page.locator('.drive-mode-log-btn').click();await page.locator('.logbook-ui-v110 .log-graph-v110').waitFor();}
async function setup(page,context,state,at='2026-09-10T09:44:00Z'){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});assert.equal(route.request().method(),'GET','browser override test cannot send app writes');return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic override test: external access blocked'},headers});});
 await page.clock.setFixedTime(new Date(at));
 await page.goto(origin+'/_not-found');await page.evaluate(async({schemas,state,session})=>{localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const [name,schema]of Object.entries(schemas)){const [key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{schemas,state,session});await page.goto(origin);await openLog(page);
}
async function openEdit(page,id='target'){const row=page.locator(`[data-log-event-id=${id}]`);if(await row.locator('.motive-edit-reveal-v11027').count()===0)await row.click();await row.locator('.motive-edit-reveal-v11027').click();await page.locator('.editor-compact-v111').waitFor();}
async function enabled(page){assert.equal(await page.locator('.save-main').isDisabled(),false);assert.equal(await page.locator('.editor-compact-v111 [role=alert]').count(),0);}
async function boundary(page,edge){return Number(await page.getByRole('slider',{name:edge+' time handle',exact:true}).getAttribute('aria-valuenow'));}
async function drag(page,edge,delta){const h=page.getByRole('slider',{name:edge+' time handle',exact:true}),r=await h.boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+delta,y,{steps:10});await page.mouse.up();}
async function range(page,start,end){await page.getByLabel('Start time',{exact:true}).fill(start);await page.getByLabel('End time',{exact:true}).fill(end);await enabled(page);}
const reports=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await type.launch({headless:true});
 for(const scenario of ['yesterday-OFF','yesterday-SB','yesterday-ON','current-D','carry-today','carry-yesterday']) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'Europe/Belgrade',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  try {
   if(scenario.startsWith('carry-')) {
    const state=fixture('SB');state.eventsByDay={'2026-09-08':[row('overnight','SB',1321,1322,{source:'live_status'})]};
    await setup(page,context,state,scenario==='carry-today'?'2026-09-09T09:44:00Z':'2026-09-10T09:44:00Z');
    const original=await stored(page);
    await page.getByRole('button',{name:'Insert',exact:true}).click();await page.locator('.editor-compact-v111').waitFor();
    await range(page,'05:00','05:30');assert.equal(await page.locator('.editor-graph-card .graph-discontinuity[data-kind="Gap"]').count(),0);
    assert.deepEqual((await stored(page)).eventsByDay,original.eventsByDay);await page.locator('.save-main').click();
    await waitState(page,s=>s.eventsByDay[day]?.some(e=>e.startMin===300&&e.endMin===330&&e.status==='ON'));
    await page.reload();await openLog(page);
    await page.getByRole('button',{name:'Insert',exact:true}).click();await page.locator('.editor-compact-v111').waitFor();
    await range(page,'01:00','01:30');assert.equal(await page.locator('.editor-graph-card .graph-discontinuity[data-kind="Gap"]').count(),0);await page.locator('.save-main').click();
    const saved=await waitState(page,s=>s.eventsByDay[day]?.some(e=>e.startMin===60&&e.endMin===90&&e.status==='ON'));
    assert.deepEqual(saved.eventsByDay['2026-09-08'],original.eventsByDay['2026-09-08']);
    await page.reload();await openLog(page);assert.deepEqual((await stored(page)).eventsByDay,saved.eventsByDay);
    await page.screenshot({path:`${output}/${name}-${scenario}-reopened.png`});assert.deepEqual(errors,[]);
    reports.push({browser:name,scenario,passed:true});console.log(`PASS — ${name} ${scenario}: carried SB, repeated Insert, Save and reopen`);continue;
   }
   const status=scenario.split('-')[1],state=fixture(status,true);
   state.eventsByDay[day].at(-1).status=status;
   if(status==='D'){state.eventsByDay[day].at(-1).id='target-live';state.manualDrivingSession={active:true,eventId:'target-live',startDay:day};}
   await setup(page,context,state,status==='D'?'2026-09-10T03:55:00Z':'2026-09-10T09:44:00Z');
   const original=await stored(page);
   await page.getByRole('button',{name:'Insert',exact:true}).click();await page.locator('.editor-compact-v111').waitFor();
   assert.equal(await page.getByLabel('End time',{exact:true}).isDisabled(),false,'Midnight End must be directly editable');
   assert.equal(await page.getByRole('slider').count(),2);
   await range(page,'23:45','23:46');await drag(page,'end',-80);
   assert.ok(await boundary(page,'end')<1426,'One-minute End must move left');
   assert.ok(await boundary(page,'start')<1425,'Start follows when the dragged End crosses it');
   await range(page,'23:45','23:46');await drag(page,'start',5);
   assert.ok(await boundary(page,'start')>1425,'One-minute Start must move right');
   assert.ok(await boundary(page,'end')>1426);
   // A tap on existing Driving keeps the insertion draft open.
   await page.locator(`.editor-graph-card [data-hit-event="${status==='D'?'early':'target'}"]`).click();
   assert.match(await page.locator('.sheet-head').innerText(),/Insert Duty Status/);
   await page.getByRole('button',{name:'PTI',exact:true}).click();
   await range(page,'23:15','23:45');
   assert.equal(await boundary(page,'start'),1395);assert.equal(await boundary(page,'end'),1425);
   assert.equal(await page.locator('.editor-graph-card .graph-discontinuity[data-kind="Gap"]').count(),0);
   assert.deepEqual((await stored(page)).eventsByDay,original.eventsByDay,'Draft interactions cannot write history');
   await page.screenshot({path:`${output}/${name}-${scenario}-before-save.png`});
   await page.locator('.cancel-main').click();assert.deepEqual((await stored(page)).eventsByDay,original.eventsByDay);
   await page.getByRole('button',{name:'Insert',exact:true}).click();await page.locator('.editor-compact-v111').waitFor();
   await range(page,'23:15','23:45');await page.getByRole('button',{name:'PTI',exact:true}).click();await page.locator('.save-main').click();
   const saved=await waitState(page,s=>s.eventsByDay[day].some(e=>e.status==='ON'&&e.startMin===1395&&e.endMin===1425));
   const inserted=saved.eventsByDay[day].find(e=>e.status==='ON'&&e.startMin===1395&&e.endMin===1425);
   assert.match(inserted.note,/pre.trip/i);
   const unchangedPrefix=status==='D'?3:4;
   assert.deepEqual(saved.eventsByDay[day].slice(0,unchangedPrefix),original.eventsByDay[day].slice(0,unchangedPrefix));
   await page.reload();await openLog(page);assert.deepEqual((await stored(page)).eventsByDay,saved.eventsByDay);
   await openEdit(page,inserted.id);assert.equal(await page.getByLabel('Start time',{exact:true}).inputValue(),'23:15');assert.equal(await page.getByLabel('End time',{exact:true}).inputValue(),'23:45');await page.locator('.cancel-main').click();
   // Insert again inside Driving and end at midnight, then reopen the saved row.
   await page.getByRole('button',{name:'Insert',exact:true}).click();await page.locator('.editor-compact-v111').waitFor();
   await range(page,'11:00','13:00');await page.locator('.save-main').click();
   await waitState(page,s=>s.eventsByDay[day].some(e=>e.status==='ON'&&e.startMin===660&&e.endMin===780));
   await page.reload();await openLog(page);
   await page.getByRole('button',{name:'Insert',exact:true}).click();await page.locator('.editor-compact-v111').waitFor();
   await range(page,'23:50','00:00');assert.equal(await boundary(page,'end'),1440);
   assert.equal(await page.getByLabel('End time',{exact:true}).isDisabled(),false);
   await page.getByLabel('End time',{exact:true}).fill('23:59');assert.equal(await boundary(page,'end'),1439);
   await page.getByLabel('End time',{exact:true}).fill('00:00');await enabled(page);await page.locator('.save-main').click();
   const midnight=await waitState(page,s=>s.eventsByDay[day].some(e=>e.startMin===1430&&e.endMin===1440&&e.status==='ON'));
   await page.reload();await openLog(page);assert.deepEqual((await stored(page)).eventsByDay,midnight.eventsByDay);
   await page.screenshot({path:`${output}/${name}-${scenario}-reopened.png`});
   for(const key of ['signatureByDay','routeLegsByDay','loadGuidesById'])assert.deepEqual(midnight[key],original[key]);
   assert.deepEqual(errors,[]);reports.push({browser:name,scenario,passed:true});console.log(`PASS — ${name} ${scenario}: Insert touch, midnight, Save, repeated insertion and reopening`);
  }catch(error){await page.screenshot({path:`${output}/${name}-${scenario}-FAILED.png`}).catch(()=>{});fs.writeFileSync(`${output}/${name}-${scenario}-state.json`,JSON.stringify(await stored(page).catch(()=>null),null,2));reports.push({browser:name,scenario,passed:false,error:String(error),stack:error.stack,errors});console.error(error);}
  finally{await context.close();}
 }
 await browser.close();
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports.filter(r=>!r.passed)));
