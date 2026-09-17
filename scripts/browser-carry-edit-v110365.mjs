// Compiled-app integration: synthetic browser records only; external account APIs are intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output='browser-test-results/carry-edit-v110365';fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000023',email:'override-fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const day='2026-09-16',prior='2026-09-15';
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Willowbrook',state:'IL',source:'manual',...extra});
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state);};q.onerror=()=>reject(q.error);};}));}
async function waitState(page,condition){for(let n=0;n<100;n++){const s=await stored(page);if(s&&condition(s))return s;await page.waitForTimeout(100);}throw Error('Override fixture persistence timeout');}
async function openLog(page){await page.locator('.drive-mode-log-btn, .logbook-ui-v110 .log-graph-v110').first().waitFor({timeout:30000});if(await page.locator('.drive-mode-log-btn').isVisible())await page.locator('.drive-mode-log-btn').click();await page.locator('.logbook-ui-v110 .log-graph-v110').waitFor();}
async function setup(page,context,state,clock='2026-09-10T12:15:00Z'){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});assert.equal(route.request().method(),'GET','browser override test cannot send app writes');return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic override test: external access blocked'},headers});});
 await page.clock.setFixedTime(new Date(clock));
 await page.goto(origin+'/_not-found');await page.evaluate(async({schemas,state,session})=>{localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const [name,schema]of Object.entries(schemas)){const [key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{schemas,state,session});await page.goto(origin);await openLog(page);
}
function fixture(scenario) {
 const current=scenario==='current-prefix',activeDay=current?'2026-09-17':day;
 const eventsByDay={
  [prior]:[row('prior','OFF',1200,1440,{note:'Off Duty'})],
  [day]:scenario==='full-day'?[]:[row('pti','ON',617,632),row('drive-a','D',632,725),row('off-a','OFF',725,851),row('drive-b','D',851,962),row('off-b','OFF',962,1090),row('on-b','ON',1090,1110),row('drive-c','D',1110,1440)],
  '2026-09-17':[row('today','OFF',0,120)]
 };
 if(current){eventsByDay[day]=[row('yesterday','OFF',0,1440)];eventsByDay[activeDay]=[row('live','ON',90,91,{source:'live_status'})];}
 return {view:'day',activeDay,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'TEST',trailer:'TEST'},driverProfile:{name:'Synthetic Driver'},carrierName:'Synthetic Carrier',mainOfficeAddress:'Test Office',currentTrailer:'TEST',currentStatus:current?'ON':'OFF',currentReason:current?'On Duty':'Off Duty',currentLocation:{city:'Willowbrook',state:'IL'},eventsByDay,certifyStatus:{[prior]:'Needs signature',[activeDay]:'Needs signature'},signatureByDay:{},logbookEditHistoryByDay:{},inspectionByDay:{},routeLegsByDay:{},formByDay:{},loadGuidesById:{},dotWallet:{documents:{}}};
}
const reports=[];
for(const[name,type]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 for(const scenario of ['prefix','full-day','current-prefix']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'America/Chicago',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async d=>{errors.push('Unexpected dialog: '+d.message());await d.dismiss();});
  try{
   const initial=fixture(scenario),activeDay=initial.activeDay,end=scenario==='prefix'?617:scenario==='full-day'?1440:90;
   await setup(page,context,initial,'2026-09-17T06:00:00Z');
   const carry=page.locator('.events .continuity-only-v11026').first();await carry.waitFor();
   const carryId=await carry.getAttribute('data-log-event-id'),before=await stored(page);
   assert.equal(await carry.locator('.event-continuity-tag-v11026').count(),0,'the misleading Sign badge is removed');
   const action=carry.getByRole('button',{name:'Edit continued status',exact:true});
   const hit=await action.boundingBox();assert.ok(hit.width>=44&&hit.height>=44,'carried status has a usable touch target');
   if(scenario==='prefix')await carry.tap({position:{x:95,y:30}});
   else await page.locator(`.logbook-ui-v110 [data-hit-event="${carryId}"]`).tap();
   await page.waitForFunction(id=>document.querySelector(`[data-log-event-id="${id}"]`)?.classList.contains('selected'),carryId);
   assert.equal(await page.locator('.editor-ui-v110').count(),0,'selection is read-only');
   await action.tap();await page.locator('.editor-ui-v110').waitFor();
   assert.equal(await page.locator('.editor-ui-v110 .sheet-head div').innerText(),'Edit Duty Status');
   assert.equal(await page.getByLabel('Start time',{exact:true}).inputValue(),'00:00');
   // Native time fields display midnight as 00:00; the draft retains minute 1440.
   assert.equal(await page.getByLabel('End time',{exact:true}).inputValue(),scenario==='prefix'?'10:17':scenario==='full-day'?'00:00':'01:30');
   assert.equal(await page.getByRole('slider',{name:'start time handle',exact:true}).getAttribute('aria-valuenow'),'0');
   assert.equal(await page.getByRole('slider',{name:'end time handle',exact:true}).getAttribute('aria-valuenow'),String(end));
   assert.equal(await page.getByLabel('End at 24:00',{exact:true}).isChecked(),scenario==='full-day');
   assert.equal(await page.locator('.save-main').innerText(),`Save OFF · ${end}m`);
   await page.locator('.editor-duty-grid [data-status="SB"]').tap();
   await page.locator('.cancel-main').tap();
   const canceled=await stored(page);
   for(const key of ['eventsByDay','signatureByDay','logbookEditHistoryByDay'])assert.deepEqual(canceled[key],before[key],'Cancel preserves '+key);
   await action.tap();await page.locator('.editor-ui-v110').waitFor();
   await page.locator('.editor-duty-grid [data-status="SB"]').tap();
   if(scenario==='full-day'){
    await page.getByLabel('Start time',{exact:true}).fill('04:00');
    await page.getByLabel('End time',{exact:true}).fill('10:00');
   }
   assert.equal(await page.locator('.save-main').isDisabled(),false);
   assert.equal(await page.locator('.editor-ui-v110 [role=alert]').count(),0);
   await page.screenshot({path:`${output}/${name}-${scenario}-draft.png`});
   await page.locator('.save-main').tap();
   const saved=await waitState(page,s=>s.eventsByDay[activeDay]?.some(e=>e.status==='SB'&&e.startMin===(scenario==='full-day'?240:0)&&e.endMin===(scenario==='full-day'?600:end)));
   const correction=saved.eventsByDay[activeDay].find(e=>e.status==='SB');
   assert.equal(correction.source,'manual');
   assert.equal(Boolean(correction.displayOnly||correction.syntheticCoverage||correction.carriedFromPreviousDay),false);
   for(const otherDay of Object.keys(before.eventsByDay).filter(d=>d!==activeDay))assert.deepEqual(saved.eventsByDay[otherDay],before.eventsByDay[otherDay],'other day is unchanged: '+otherDay);
   for(const key of ['signatureByDay','routeLegsByDay','loadGuidesById','currentStatus'])assert.deepEqual(saved[key],before[key],'correction preserves '+key);
   const history=saved.logbookEditHistoryByDay[activeDay];assert.equal(history.length,(before.logbookEditHistoryByDay[activeDay]||[]).length+1);
   assert.deepEqual(history.at(-1).beforeEvents,before.eventsByDay[activeDay]||[]);
   if(scenario==='full-day')assert.deepEqual(saved.eventsByDay[activeDay].map(e=>[e.status,e.startMin,e.endMin]),[['OFF',0,240],['SB',240,600],['OFF',600,1440]]);
   else assert.deepEqual(saved.eventsByDay[activeDay].filter(e=>e.id!==correction.id),before.eventsByDay[activeDay],'recorded neighboring events remain intact');
   await page.reload();await openLog(page);
   const reopened=await stored(page);assert.deepEqual(reopened.eventsByDay,saved.eventsByDay);assert.deepEqual(reopened.logbookEditHistoryByDay,saved.logbookEditHistoryByDay);
   const savedRow=page.locator(`[data-log-event-id="${correction.id}"]`);await savedRow.waitFor();
   assert.equal(await savedRow.locator('.event-badge').innerText(),'SB');
   await savedRow.tap({position:{x:95,y:30}});await savedRow.getByRole('button',{name:'Edit selected event',exact:true}).tap();await page.locator('.editor-ui-v110').waitFor();
   assert.equal(await page.getByLabel('Start time',{exact:true}).inputValue(),scenario==='full-day'?'04:00':'00:00');
   await page.locator('.cancel-main').tap();assert.deepEqual((await stored(page)).eventsByDay,saved.eventsByDay);
   await page.screenshot({path:`${output}/${name}-${scenario}-saved.png`});
   assert.deepEqual(errors,[]);reports.push({browser:name,scenario,passed:true});console.log(`PASS — ${name} ${scenario}: touch, draft, Cancel, Save, day isolation, history and reload`);
  }catch(error){await page.screenshot({path:`${output}/${name}-${scenario}-FAILED.png`}).catch(()=>{});fs.writeFileSync(`${output}/${name}-${scenario}-state.json`,JSON.stringify(await stored(page).catch(()=>null),null,2));reports.push({browser:name,scenario,passed:false,error:String(error),stack:error.stack,errors});console.error(error);}
  finally{await context.close();}
 }
 await browser.close();
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports.filter(r=>!r.passed)));
