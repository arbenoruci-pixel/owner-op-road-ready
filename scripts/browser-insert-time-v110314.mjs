// Compiled-app integration: synthetic browser records only; external account APIs are intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output=`browser-test-results/insert-time-${process.env.TEST_ORIGIN?'production':'local'}`;fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000023',email:'override-fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const day='2026-09-09';
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Willowbrook',state:'IL',source:'manual',...extra});
function fixture(status='SB') { return {view:'day',activeDay:day,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'TEST',trailer:'TEST'},driverProfile:{name:'Synthetic Driver'},carrierName:'Synthetic Carrier',mainOfficeAddress:'Test Office',currentTrailer:'TEST',currentStatus:status,currentReason:'Keep activity',currentLocation:{city:'Willowbrook',state:'IL'},eventsByDay:{[day]:[row('earlier',status==='OFF'?'ON':'OFF',0,1320),row('target',status,1320,1321,{source:'live_status',note:'Keep activity'})]},certifyStatus:{[day]:'Needs signature'},signatureByDay:{'2026-09-08':{signed:true}},inspectionByDay:{},routeLegsByDay:{},formByDay:{},loadGuidesById:{},dotWallet:{documents:{}}}; }
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state);};q.onerror=()=>reject(q.error);};}));}
async function waitState(page,condition){for(let n=0;n<100;n++){const s=await stored(page);if(s&&condition(s))return s;await page.waitForTimeout(100);}throw Error('Override fixture persistence timeout');}
async function openLog(page){await page.locator('.logbook-ui-v110 .log-graph-v110').waitFor({timeout:30000});}
async function setup(page,context,state){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});assert.equal(route.request().method(),'GET','browser override test cannot send app writes');return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic override test: external access blocked'},headers});});
 await page.clock.setFixedTime(new Date('2026-09-10T03:27:00Z'));
 await page.goto(origin+'/_not-found');await page.evaluate(async({schemas,state,session})=>{localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const [name,schema]of Object.entries(schemas)){const [key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{schemas,state,session});await page.goto(origin);await openLog(page);
}
async function openInsert(page) {
 await page.getByRole('button',{name:'Insert',exact:true}).click();
 await page.locator('.editor-compact-v111').waitFor();
}
async function times(page) {return Promise.all(['Start time','End time'].map(name=>page.getByLabel(name,{exact:true}).inputValue()));}
async function valid(page,expected) {
 const values=await times(page),mins=values.map(v=>Number(v.slice(0,2))*60+Number(v.slice(3)));
 if(expected)assert.deepEqual(values,expected);
 assert.ok(mins[0]>=0&&mins[0]<mins[1]&&mins[1]<=1407,JSON.stringify(values));
 assert.equal(await page.locator('.save-main').isDisabled(),false,'Elapsed Insert must be savable');
 assert.equal(await page.locator('.editor-compact-v111 [role=alert]').count(),0);
 assert.equal(await page.locator('.editor-compact-v111 .graph-discontinuity').count(),0);
 return mins;
}
async function drag(page,edge,dx) {
 const handle=page.getByRole('slider',{name:edge+' time handle',exact:true}),r=await handle.boundingBox();
 const x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y,{steps:12});await page.mouse.up();
}
const reports=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await type.launch({headless:true});
 for(const status of ['SB','OFF','ON']) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'Europe/Belgrade',serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  try {
   await setup(page,context,fixture(status));const original=await stored(page);
   assert.ok(original.eventsByDay[day].some(e=>e.id==='target'&&e.source==='live_status'),'Fixture must retain a real current status change after startup');
   await openInsert(page);await valid(page,['23:12','23:27']);
   if(status==='SB') {
    await page.screenshot({path:`${output}/${name}-opening-2327.png`});
    for(const [label,expected] of [['NOW',['23:12','23:27']],['10 MIN AGO',['23:17','23:27']],['15 MIN AGO',['23:12','23:27']],['30 MIN AGO',['22:57','23:27']]]) {
     await page.getByRole('button',{name:label,exact:true}).click();await valid(page,expected);
    }
    await page.getByRole('button',{name:'NOW',exact:true}).click();
    await drag(page,'start',-8);assert.ok((await valid(page))[0]<1392,'Start handle must move backwards');
    const before=(await valid(page))[0];await drag(page,'start',4);assert.ok((await valid(page))[0]>before,'Start handle must move forwards');
    await drag(page,'end',-4);assert.ok((await valid(page))[1]<1407,'End handle must move backwards');
    await drag(page,'end',30);assert.equal((await valid(page))[1],1407,'End clamps at Now');
    await page.getByLabel('End time',{exact:true}).fill('23:28');assert.equal((await valid(page))[1],1407);
    await page.getByLabel('End time',{exact:true}).fill('22:50');await valid(page);
    await page.getByLabel('Start time',{exact:true}).fill('23:20');await valid(page);
    await page.getByText('Duration presets',{exact:true}).click();
    await page.getByRole('button',{name:'30m',exact:true}).click();await valid(page,['22:57','23:27']);
    await page.getByText('Fine tune',{exact:true}).click();
    await page.getByRole('button',{name:'Add one minute to end',exact:true}).click();await valid(page,['22:57','23:27']);
    await page.getByRole('button',{name:'Subtract one minute from start',exact:true}).click();await valid(page,['22:56','23:27']);
    await page.locator('.cancel-main').click();
    const cancelled=await stored(page);assert.deepEqual(cancelled.eventsByDay,original.eventsByDay);assert.deepEqual(cancelled.logbookEditHistoryByDay,original.logbookEditHistoryByDay);
    await openInsert(page);await valid(page,['23:12','23:27']);
   }
   await page.getByLabel('Start time',{exact:true}).fill('23:26');await page.getByLabel('End time',{exact:true}).fill('23:27');
   await valid(page,['23:26','23:27']);
   await page.locator('.quick-activities-v11023').getByRole('button',{name:'Fuel',exact:true}).click();
   await page.screenshot({path:`${output}/${name}-${status}-ready-save.png`});
   await page.locator('.save-main').click();
   const saved=await waitState(page,s=>s.eventsByDay[day].some(e=>e.id!=='target'&&e.startMin===1406&&e.endMin===1407));
   const inserted=saved.eventsByDay[day].find(e=>e.startMin===1406&&e.endMin===1407);
   assert.equal(inserted.status,'ON');assert.ok(inserted.reasons.includes('Fuel'));assert.equal(saved.currentStatus,status);
   assert.equal(saved.eventsByDay[day].find(e=>e.id==='target').startMin,1407);
   assert.equal(saved.eventsByDay[day].find(e=>e.id==='target').source,'live_status');
   assert.deepEqual(saved.logbookEditHistoryByDay[day][0].beforeEvents,original.eventsByDay[day]);
   for(const key of ['signatureByDay','routeLegsByDay','loadGuidesById'])assert.deepEqual(saved[key],original[key]);
   await page.reload();await openLog(page);const reopened=await stored(page);
   assert.deepEqual(reopened.eventsByDay,saved.eventsByDay);assert.deepEqual(reopened.logbookEditHistoryByDay,saved.logbookEditHistoryByDay);assert.equal(reopened.currentStatus,status);
   await page.clock.setFixedTime(new Date('2026-09-10T03:32:00Z'));await page.reload();await openLog(page);
   await page.locator('[data-log-event-id=target]').waitFor();
   assert.match(await page.locator('[data-log-event-id=target]').innerText(),/5m/);
   assert.deepEqual((await stored(page)).eventsByDay[day].find(e=>e.id===inserted.id),inserted);
   assert.equal(await page.locator('.logbook-ui-v110 .graph-discontinuity').count(),0);
   await page.screenshot({path:`${output}/${name}-${status}-reopened.png`});
   assert.deepEqual(errors,[]);reports.push({browser:name,status,passed:true,opened:['23:12','23:27'],saved:['23:26','23:27'],reopened:true});
   console.log(`PASS — ${name} current ${status}: 23:27 default, elapsed controls, Save 23:26–23:27, resume and reopen`);
  } catch(error) {
   fs.writeFileSync(`${output}/${name}-${status}-state.json`,JSON.stringify(await stored(page).catch(()=>null),null,2));
   await page.screenshot({path:`${output}/${name}-${status}-FAILED.png`}).catch(()=>{});
   reports.push({browser:name,status,passed:false,error:String(error),stack:error.stack,pageErrors:errors});console.error(error);
  } finally {await context.close();}
 }
 // A closed day may initialize at 24:00; its End field must still be editable.
 {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Belgrade',serviceWorkers:'block'}),page=await context.newPage();
  page.on('dialog',d=>d.accept());
  try {
   const state=fixture('OFF');state.eventsByDay[day]=[row('target','OFF',0,1440)];
   await setup(page,context,state);await page.clock.setFixedTime(new Date('2026-09-11T03:27:00Z'));await page.reload();await openLog(page);await openInsert(page);
   assert.equal(await page.getByLabel('End time',{exact:true}).isDisabled(),false);
   await page.getByLabel('Start time',{exact:true}).fill('15:00');await page.getByLabel('End time',{exact:true}).fill('15:30');
   assert.deepEqual(await times(page),['15:00','15:30']);assert.equal(await page.locator('.save-main').isDisabled(),false);
   await page.locator('.save-main').click();const saved=await waitState(page,s=>s.eventsByDay[day].some(e=>e.startMin===900&&e.endMin===930));
   await page.reload();await openLog(page);assert.deepEqual((await stored(page)).eventsByDay,saved.eventsByDay);
   reports.push({browser:name,status:'historical',passed:true,reopened:true});console.log(`PASS — ${name} historical End field, Insert and reopen`);
  } catch(error) {
   await page.screenshot({path:`${output}/${name}-historical-FAILED.png`}).catch(()=>{});reports.push({browser:name,status:'historical',passed:false,error:String(error),stack:error.stack});console.error(error);
  } finally {await context.close();}
 }
 await browser.close();
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports.filter(r=>!r.passed)));
