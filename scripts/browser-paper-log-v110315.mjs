// Compiled-app integration: synthetic browser records only; external account APIs are intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output=`browser-test-results/paper-log-${process.env.TEST_ORIGIN?'production':'local'}`;fs.mkdirSync(output,{recursive:true});
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
async function setup(page,context,state){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});assert.equal(route.request().method(),'GET','browser override test cannot send app writes');return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic override test: external access blocked'},headers});});
 await page.clock.setFixedTime(new Date('2026-09-10T03:55:00Z'));
 await page.goto(origin+'/_not-found');await page.evaluate(async({schemas,state,session})=>{localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const [name,schema]of Object.entries(schemas)){const [key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{schemas,state,session});await page.goto(origin);await openLog(page);
}
async function openEdit(page,id='target'){const row=page.locator(`[data-log-event-id=${id}]`);if(await row.locator('.motive-edit-reveal-v11027').count()===0)await row.click();await row.locator('.motive-edit-reveal-v11027').click();await page.locator('.editor-compact-v111').waitFor();}
async function enabled(page){assert.equal(await page.locator('.save-main').isDisabled(),false);assert.equal(await page.locator('.editor-compact-v111 [role=alert]').count(),0);}
async function boundary(page,edge){return Number(await page.getByRole('slider',{name:edge+' time handle',exact:true}).getAttribute('aria-valuenow'));}
const reports=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await type.launch({headless:true});
 for(const scenario of ['phone','OFF','SB','ON','D','insert-D']) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'Europe/Belgrade',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  try {
   const status=scenario==='phone'?'SB':scenario==='insert-D'?'D':scenario;
   await setup(page,context,fixture(status,scenario==='phone'));const original=await stored(page);
   if(scenario==='phone') {
    await openEdit(page);assert.equal(await page.getByLabel('End time',{exact:true}).inputValue(),'22:01');
    await page.getByLabel('End time',{exact:true}).fill('18:01');await enabled(page);assert.equal(await boundary(page,'end'),1081);
    await page.screenshot({path:`${output}/${name}-phone-1801-before-save.png`});
    await page.locator('.cancel-main').click();assert.deepEqual((await stored(page)).eventsByDay,original.eventsByDay);
    await openEdit(page);
    const h=page.getByRole('slider',{name:'end time handle',exact:true}),r=await h.boundingBox(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-20,y,{steps:10});await page.mouse.up();assert.ok(await boundary(page,'end')<1321);await enabled(page);
    await page.getByLabel('End time',{exact:true}).fill('18:01');await page.locator('.save-main').click();
    const saved=await waitState(page,s=>s.eventsByDay[day].find(e=>e.id==='target')?.endMin===1081);
    assert.equal(saved.eventsByDay[day].find(e=>e.id==='live').startMin,1081);assert.deepEqual(saved.eventsByDay[day].slice(0,3),original.eventsByDay[day].slice(0,3));
    await page.reload();await openLog(page);await openEdit(page);assert.equal(await boundary(page,'end'),1081);assert.equal(await page.getByLabel('End time',{exact:true}).inputValue(),'18:01');
    await page.getByLabel('End time',{exact:true}).fill('20:01');await enabled(page);await page.locator('.save-main').click();
    await waitState(page,s=>s.eventsByDay[day].find(e=>e.id==='live')?.startMin===1201);
    await page.reload();await openLog(page);await openEdit(page);
    await page.locator('.editor-duty-grid').getByRole('button',{name:'OFF',exact:true}).click();await enabled(page);await page.locator('.save-main').click();
    const third=await waitState(page,s=>s.eventsByDay[day].find(e=>e.id==='target')?.status==='OFF');assert.equal(third.eventsByDay[day].find(e=>e.id==='target').endMin,1201);
    await page.reload();await openLog(page);assert.deepEqual((await stored(page)).eventsByDay,third.eventsByDay);
    await page.screenshot({path:`${output}/${name}-phone-repeated-edits-reopened.png`});
   } else if(scenario==='insert-D') {
    await page.getByRole('button',{name:'Insert',exact:true}).click();await page.locator('.editor-compact-v111').waitFor();
    assert.equal(await page.getByLabel('End time',{exact:true}).inputValue(),'23:55');
    await page.getByRole('button',{name:'30 MIN AGO',exact:true}).click();assert.equal(await page.getByLabel('Start time',{exact:true}).inputValue(),'23:25');
    await page.getByLabel('Start time',{exact:true}).fill('23:54');await page.getByLabel('End time',{exact:true}).fill('23:59');await enabled(page);assert.equal(await boundary(page,'end'),1439);
    await page.getByLabel('End time',{exact:true}).fill('23:55');await page.locator('.save-main').click();
    const saved=await waitState(page,s=>s.eventsByDay[day].some(e=>e.startMin===1434&&e.endMin===1435));assert.equal(saved.eventsByDay[day].find(e=>e.id==='target').startMin,1435);assert.equal(saved.currentStatus,'D');
    await page.reload();await openLog(page);assert.deepEqual((await stored(page)).eventsByDay,saved.eventsByDay);await page.screenshot({path:`${output}/${name}-insert-driving-reopened.png`});
   } else {
    await openEdit(page);assert.equal(await page.getByRole('slider').count(),2);assert.equal(await page.getByLabel('End time',{exact:true}).isDisabled(),false);assert.equal(await page.locator('.editor-duty-grid button').count(),4);
    const next=status==='ON'?'SB':'ON';await page.locator('.editor-duty-grid').getByRole('button',{name:next,exact:true}).click();await enabled(page);await page.locator('.save-main').click();
    const changed=await waitState(page,s=>s.eventsByDay[day].find(e=>e.id==='target')?.status===next);assert.equal(changed.currentStatus,next);
    await page.reload();await openLog(page);await openEdit(page);await page.getByLabel('End time',{exact:true}).fill('23:45');await enabled(page);assert.equal(await boundary(page,'end'),1425);
    await page.locator('.save-main').click();const ended=await waitState(page,s=>s.eventsByDay[day].find(e=>e.id==='target')?.paperLogEndV110315===true);assert.equal(ended.eventsByDay[day].find(e=>e.id==='target').endMin,1425);
    await page.clock.setFixedTime(new Date('2026-09-10T03:56:00Z'));await page.reload();await openLog(page);await openEdit(page);
    assert.equal(await page.getByLabel('End time',{exact:true}).inputValue(),'23:45');assert.equal(await boundary(page,'end'),1425);assert.deepEqual((await stored(page)).eventsByDay,ended.eventsByDay);
    if(status==='D')assert.equal((await stored(page)).manualDrivingSession.active,false);
    await page.screenshot({path:`${output}/${name}-${status}-end-persists.png`});
   }
   const final=await stored(page);for(const key of ['signatureByDay','routeLegsByDay','loadGuidesById'])assert.deepEqual(final[key],original[key]);
   assert.deepEqual(errors,[]);reports.push({browser:name,scenario,passed:true});console.log(`PASS — ${name} paper log ${scenario}: edit, Save and reopen without live/ELD locks`);
  } catch(error){await page.screenshot({path:`${output}/${name}-${scenario}-FAILED.png`}).catch(()=>{});fs.writeFileSync(`${output}/${name}-${scenario}-state.json`,JSON.stringify(await stored(page).catch(()=>null),null,2));reports.push({browser:name,scenario,passed:false,error:String(error),stack:error.stack,errors});console.error(error);}
  finally{await context.close();}
 }
 await browser.close();
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports.filter(r=>!r.passed)));
