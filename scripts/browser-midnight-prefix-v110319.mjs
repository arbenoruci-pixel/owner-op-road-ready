// Compiled-app integration: synthetic browser records only; external account APIs are intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output=`browser-test-results/midnight-prefix-${process.env.TEST_ORIGIN?'production':'local'}`;fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000023',email:'override-fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const day='2026-09-10',prior='2026-09-09';
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Willowbrook',state:'IL',source:'manual',...extra});
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state);};q.onerror=()=>reject(q.error);};}));}
async function waitState(page,condition){for(let n=0;n<100;n++){const s=await stored(page);if(s&&condition(s))return s;await page.waitForTimeout(100);}throw Error('Override fixture persistence timeout');}
async function openLog(page){await page.locator('.drive-mode-log-btn, .logbook-ui-v110 .log-graph-v110').first().waitFor({timeout:30000});if(await page.locator('.drive-mode-log-btn').isVisible())await page.locator('.drive-mode-log-btn').click();await page.locator('.logbook-ui-v110 .log-graph-v110').waitFor();}
async function setup(page,context,state,clock='2026-09-10T12:15:00Z'){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});assert.equal(route.request().method(),'GET','browser override test cannot send app writes');return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic override test: external access blocked'},headers});});
 await page.clock.setFixedTime(new Date(clock));
 await page.goto(origin+'/_not-found');await page.evaluate(async({schemas,state,session})=>{localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const [name,schema]of Object.entries(schemas)){const [key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{schemas,state,session});await page.goto(origin);await openLog(page);
}
async function openEdit(page,id='target'){const row=page.locator(`[data-log-event-id=${id}]`);if(await row.locator('.motive-edit-reveal-v11027').count()===0)await row.click();await row.locator('.motive-edit-reveal-v11027').click();await page.locator('.editor-compact-v111').waitFor();}
async function enabled(page){assert.equal(await page.locator('.save-main').isDisabled(),false);assert.equal(await page.locator('.editor-compact-v111 [role=alert]').count(),0);}
async function boundary(page,edge){return Number(await page.getByRole('slider',{name:edge+' time handle',exact:true}).getAttribute('aria-valuenow'));}

function fixture(scenario){
 const start=scenario==='new-event'?495:489,ended=scenario==='saved-end';
 return {view:'day',activeDay:day,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'TEST',trailer:'TEST'},driverProfile:{name:'Synthetic Driver'},carrierName:'Synthetic Carrier',mainOfficeAddress:'Test Office',currentTrailer:'TEST',currentStatus:ended?'D':'ON',currentReason:ended?'Driving started':'Pre-trip inspection',currentLocation:{city:'Willowbrook',state:'IL'},eventsByDay:{[prior]:[row('rest','SB',1321,1322,{source:'live_status',note:'Sleeper Berth'})],[day]:[row('target','ON',start,ended?501:start+1,{source:'live_status',note:'Pre-trip inspection',...(ended?{paperLogEndV110315:true}:{})}),...(ended?[row('drive','D',501,502,{source:'live_status',note:'Driving started'})]:[])]},certifyStatus:{[day]:'Needs signature'},signatureByDay:{},logbookEditHistoryByDay:{},inspectionByDay:{},routeLegsByDay:{},formByDay:{},loadGuidesById:{},dotWallet:{documents:{}}};
}
async function expectPrefix(page,start){
 const graph=page.locator('.logbook-ui-v110 .log-graph-v110');await graph.waitFor();
 assert.equal(await graph.locator('.graph-discontinuity').count(),0,'Known midnight rest stays connected to the first change');
 const rows=page.locator('.events.clean-events .clean-event-row');await rows.first().waitFor();
 assert.equal(await rows.first().locator('.event-badge').innerText(),'SB');
 assert.match(await rows.first().innerText(),new RegExp(`${Math.floor(start/60)}h ${start%60}m`));
 assert.equal(await rows.first().locator('.motive-edit-reveal-v11027').count(),0);
}
const reports=[];
for(const[name,type]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 for(const scenario of ['new-event','elapsed-event','saved-end']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'America/Chicago',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  try{
   const initial=fixture(scenario),start=initial.eventsByDay[day][0].startMin;
   await setup(page,context,initial,scenario==='saved-end'?'2026-09-10T12:25:00Z':'2026-09-10T12:15:00Z');
   const before=await stored(page);await expectPrefix(page,start);await openEdit(page);
   assert.equal(await page.locator('.editor-compact-v111 .graph-discontinuity').count(),0);
   assert.equal(await page.getByLabel('End time',{exact:true}).inputValue(),scenario==='saved-end'?'08:21':'08:15');
   assert.equal(await page.locator('.save-main').isDisabled(),true,'Opening the editor does not change End');
   if(scenario==='saved-end'){
    await page.getByLabel('Start time',{exact:true}).fill('08:05');await enabled(page);
    assert.equal(await page.locator('.editor-compact-v111 .graph-discontinuity').count(),0);
   }else{
    await page.getByRole('button',{name:'Delivery',exact:true}).click();
    await page.getByPlaceholder('BOL or load reference',{exact:true}).fill('76543210');await enabled(page);
   }
   await page.screenshot({path:`${output}/${name}-${scenario}-editor.png`});
   await page.locator('.save-main').click();
   const saved=await waitState(page,s=>scenario==='saved-end'?s.eventsByDay[day].find(e=>e.id==='target')?.startMin===485:s.eventsByDay[day].find(e=>e.id==='target')?.loadNo==='76543210');
   const target=saved.eventsByDay[day].find(e=>e.id==='target');
   assert.equal(target.endMin,before.eventsByDay[day].find(e=>e.id==='target').endMin);
   assert.equal(Boolean(target.paperLogEndV110315),scenario==='saved-end');
   await expectPrefix(page,scenario==='saved-end'?485:start);
   if(scenario!=='saved-end'){
    await page.clock.setFixedTime(new Date('2026-09-10T12:21:00Z'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByRole('button',{name:'Status',exact:true}).click();await page.locator('.duty-grid [data-status="D"]').click();
    await page.getByPlaceholder('City, ST',{exact:true}).fill('Willowbrook, IL');await page.getByRole('button',{name:'Save D',exact:true}).click();
    await waitState(page,s=>s.currentStatus==='D'&&s.eventsByDay[day].some(e=>e.status==='D'&&e.startMin===501));await openLog(page);
    await expectPrefix(page,start);
   }
   const final=await stored(page);assert.deepEqual(final.eventsByDay[prior],before.eventsByDay[prior]);assert.deepEqual(final.signatureByDay,before.signatureByDay);
   await page.reload();await openLog(page);await expectPrefix(page,scenario==='saved-end'?485:start);
   assert.deepEqual((await stored(page)).eventsByDay,final.eventsByDay);assert.deepEqual(errors,[]);
   await page.screenshot({path:`${output}/${name}-${scenario}-reopened.png`});
   reports.push({browser:name,scenario,passed:true});console.log(`PASS — ${name} ${scenario}: midnight SB, editor End, Save, Driving and reload`);
  }catch(error){await page.screenshot({path:`${output}/${name}-${scenario}-FAILED.png`}).catch(()=>{});fs.writeFileSync(`${output}/${name}-${scenario}-state.json`,JSON.stringify(await stored(page).catch(()=>null),null,2));reports.push({browser:name,scenario,passed:false,error:String(error),stack:error.stack,errors});console.error(error);}
  finally{await context.close();}
 }
 await browser.close();
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports.filter(r=>!r.passed)));
