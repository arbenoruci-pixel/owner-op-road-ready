// Compiled-app integration: synthetic browser records only; external account APIs are intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output='browser-test-results/continuous-miles-v110366';fs.mkdirSync(output,{recursive:true});
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

function fixture(live) {
 const events=[row('sleep','SB',0,617),row('pti','ON',617,632),row('drive-a','D',632,725),row('off-a','OFF',725,851,{city:'Ridgefield',state:'NJ'}),row('drive-b','D',851,962,{city:'Ridgefield',state:'NJ'}),row('off-b','OFF',962,1090,{city:'Saugerties',state:'NY'}),row('on-b','ON',1090,1110,{city:'Saugerties',state:'NY'}),row('drive-c','D',1110,live?1111:1440,{city:'Saugerties',state:'NY',source:live?'live_status':'manual'})];
 const eventsByDay={[prior]:[row('prior','OFF',0,1440)],[day]:events};
 if(!live)eventsByDay['2026-09-17']=[row('today','OFF',0,120)];
 return {view:'day',activeDay:day,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'TEST',trailer:'TEST'},driverProfile:{name:'Synthetic Driver'},carrierName:'Synthetic Carrier',mainOfficeAddress:'Test Office',currentTrailer:'TEST',currentStatus:live?'D':'OFF',currentReason:live?'Driving':'Off Duty',currentLocation:{city:'Saugerties',state:'NY'},eventsByDay,certifyStatus:{[day]:'Needs signature'},signatureByDay:{},logbookEditHistoryByDay:{},inspectionByDay:{},routeLegsByDay:{},formByDay:{},loadGuidesById:{},dotWallet:{documents:{}}};
}
async function openMiles(page){
 await page.getByRole('button',{name:'Sign',exact:true}).click();
 await page.locator('.dot-simple-launch').click();
 await page.locator('.dot-simple-issue').filter({hasText:'Total driving miles missing'}).click();
 await page.getByRole('dialog',{name:'Daily mileage segments'}).waitFor();
}
const reports=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 for(const live of [false,true]){
  const scenario=live?'live':'historical',context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'America/Chicago',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async d=>{if(d.message().startsWith('Saved ')&&d.message().endsWith(' total driving miles.'))await d.accept();else{errors.push('Unexpected dialog: '+d.message());await d.dismiss();}});
  try{
   await setup(page,context,fixture(live),live?'2026-09-17T00:30:00Z':'2026-09-17T06:00:00Z');
   const before=await stored(page);await openMiles(page);
   const modal=page.getByRole('dialog',{name:'Daily mileage segments'}),third=page.getByLabel('Miles for segment 3',{exact:true});
   assert.equal(await modal.locator('.mileage-segment-row').count(),3);
   assert.match(await modal.locator('.mileage-segment-row').nth(2).innerText(),/Continues/);
   assert.equal(await third.inputValue(),live?'124':'341');
   assert.match(await modal.locator('.mileage-segment-row').nth(2).innerText(),/62 mph/);
   await third.fill('325.5');
   await page.clock.setFixedTime(new Date(live?'2026-09-17T00:45:00Z':'2026-09-17T06:15:00Z'));
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(1200);
   assert.equal(await third.inputValue(),'325.5','clock updates preserve typed mileage');
   await modal.getByRole('button',{name:'Cancel',exact:true}).click();
   const canceled=await stored(page);
   for(const key of ['signatureByDay','logbookEditHistoryByDay'])assert.deepEqual(canceled[key],before[key]);
   if(!live)assert.deepEqual(canceled.eventsByDay,before.eventsByDay,'Cancel does not change records');
   await openMiles(page);assert.equal(await third.inputValue(),live?'139.5':'341','reopening uses the latest elapsed time');
   await third.fill('');assert.equal(await modal.getByRole('button',{name:'Save daily miles',exact:true}).isDisabled(),true);
   await third.fill('325.5');
   const inputs=modal.locator('.mileage-segment-input input'),values=await inputs.evaluateAll(nodes=>nodes.map(n=>Number(n.value))),total=Number(values.reduce((a,b)=>a+b,0).toFixed(2));
   const preSave=await stored(page);
   await page.screenshot({path:`${output}/${name}-${scenario}-draft.png`});
   await modal.getByRole('button',{name:'Save daily miles',exact:true}).click();
   const saved=await waitState(page,s=>s.eventsByDay[day]?.filter(e=>e.status==='D').every((e,i)=>e.manualMiles===values[i])&&s.manualMilesByDay?.[day]===total);
   for(const d of Object.keys(preSave.eventsByDay).filter(d=>d!==day))assert.deepEqual(saved.eventsByDay[d],preSave.eventsByDay[d]);
   const timing=events=>events.map(({id,status,startMin,endMin,city,state})=>({id,status,startMin,endMin,city,state}));
   assert.deepEqual(timing(saved.eventsByDay[day]),timing(preSave.eventsByDay[day]),'saving miles preserves all duty intervals and locations');
   assert.deepEqual(saved.eventsByDay[day].filter(e=>e.status!=='D'),preSave.eventsByDay[day].filter(e=>e.status!=='D'));
   assert.deepEqual(saved.signatureByDay,preSave.signatureByDay);
   await page.reload();await openLog(page);
   const reopened=await stored(page);assert.equal(reopened.manualMilesByDay[day],total);assert.deepEqual(reopened.eventsByDay[day].filter(e=>e.status==='D').map(e=>e.manualMiles),values);
   await page.screenshot({path:`${output}/${name}-${scenario}-saved.png`});assert.deepEqual(errors,[]);
   reports.push({browser:name,scenario,passed:true,total});console.log(`PASS — ${name} ${scenario}: three trips, elapsed time, stable draft, Cancel, Save, total and reload`);
  }catch(error){await page.screenshot({path:`${output}/${name}-${scenario}-FAILED.png`}).catch(()=>{});fs.writeFileSync(`${output}/${name}-${scenario}-state.json`,JSON.stringify(await stored(page).catch(()=>null),null,2));reports.push({browser:name,scenario,passed:false,error:String(error),stack:error.stack,errors});console.error(error);}
  finally{await context.close();}
 }
 await browser.close();
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports.filter(r=>!r.passed)));
