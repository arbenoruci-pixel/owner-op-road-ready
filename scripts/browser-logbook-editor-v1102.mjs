// Real compiled app, synthetic IndexedDB fixtures, all external writes blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
const origin=process.env.TEST_ORIGIN || 'http://127.0.0.1:3000';
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const token=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic';
const session={access_token:token,refresh_token:'synthetic-no-real-token',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Albany',state:'NY',description:'Terminal check',note:status==='D'?'Driving':status==='ON'?'Waiting':'Off Duty',source:'manual',...extra});
function fixture(live){const day=live?'2026-09-06':'2026-07-10';return {view:'day',activeDay:day,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',settings:{homeTerminalTimeZone:'America/New_York'},driver:{truck:'12',trailer:'53'},driverProfile:{name:'Test Driver'},carrierName:'Test Carrier',mainOfficeAddress:'Test Office',currentTrailer:'53',currentStatus:live?'D':'OFF',currentReason:live?'Driving':'Off Duty',currentLocation:{city:'Albany',state:'NY'},eventsByDay:{[day]:live?[row('rest','OFF',0,900),row('inspection','ON',900,915),row('live','D',915,916,{source:'live_status',lat:42.6,lng:-73.7,gpsAccuracy:5,locationSource:'manual_gps_lock'})]:[row('rest','OFF',0,915),row('short','ON',915,916),row('driving','D',920,1040),row('overlap','ON',1038,1100),row('midnight','OFF',1100,1440)]},manualDrivingSession:live?{active:true,eventId:'live',startedAt:'2026-09-06T19:15:00Z',startedDay:day,startedMin:915}:null,certifyStatus:{[day]:'Needs signature'},signatureByDay:{},inspectionByDay:{},routeLegsByDay:{},formByDay:{},loadGuidesById:{},dotWallet:{documents:{}}};}
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onerror=()=>{db.close();reject(q.error);};q.onsuccess=()=>{db.close();resolve(q.result?.state);};};}));}
async function waitState(page,predicate){for(let n=0;n<100;n++){const s=await stored(page);if(s&&predicate(s))return s;await page.waitForTimeout(100);}throw Error('Persistent fixture state condition timed out');}
async function setup(page,context,state){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',status:200,headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'External requests disabled in synthetic browser test'},headers});});
 await page.clock.setFixedTime(new Date('2026-09-06T21:20:00Z'));
 await page.goto(origin+'/_not-found');
 await page.evaluate(async({schemas,state,session})=>{localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const [name,schema]of Object.entries(schemas)){const [key,...indexes]=schema.split(',').map(s=>s.trim());const s=db.createObjectStore(name,{keyPath:key.replace(/^&/, '')});for(const raw of indexes){const f=raw.replace(/^[&*]/,'');s.createIndex(f,f.startsWith('[')?f.slice(1,-1).split('+'):f,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};};});},{schemas,state,session});
 await page.goto(origin);
 // Startup intentionally restores Drive Mode for an active session. Open its real Log action.
 if(state.manualDrivingSession?.active){await page.locator('.drive-mode-log-btn').waitFor({timeout:20000});await page.locator('.drive-mode-log-btn').click();}
 await page.locator('.logbook-v1102 [data-event-row]').first().waitFor({timeout:20000});
}
function contrast(a,b){const lum=c=>{const rgb=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};const aa=lum(a),bb=lum(b);return (Math.max(aa,bb)+.05)/(Math.min(aa,bb)+.05);}
async function visualChecks(page){
 const results=await page.locator('.editor-v1102').evaluate(root=>{const inputs=[...root.querySelectorAll('input')].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const s=getComputedStyle(e),p=getComputedStyle(e,'::placeholder');return {label:e.getAttribute('aria-label')||e.placeholder,color:s.webkitTextFillColor||s.color,background:s.backgroundColor,placeholder:p.color,fontSize:s.fontSize};});const width=innerWidth,overflow=[...root.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0 && (r.right>width+2||r.left< -2);}).map(e=>e.className?.baseVal||e.className||e.tagName);return {inputs,overflow,rootWidth:root.getBoundingClientRect().width,width};});
 for(const i of results.inputs){assert.ok(parseFloat(i.fontSize)>=16,JSON.stringify(i));assert.ok(contrast(i.color,i.background)>=4.5,'Input contrast '+JSON.stringify(i));assert.ok(contrast(i.placeholder,i.background)>=4.5,'Placeholder contrast '+JSON.stringify(i));}
 assert.deepEqual(results.overflow,[],'Horizontal clipping: '+results.overflow.join(','));
 const buttons=await page.locator('.editor-v1102 .reason-pills button, .editor-v1102 .insert-reason-grid button').evaluateAll(rows=>rows.map(e=>{const s=getComputedStyle(e);return {text:e.textContent,color:s.webkitTextFillColor==='currentcolor'?s.color:(s.webkitTextFillColor||s.color),background:s.backgroundColor};}));
 for(const b of buttons)assert.ok(contrast(b.color,b.background)>=4.5,'Activity button contrast '+JSON.stringify(b));
 results.activityButtons=buttons;return results;
}
async function openEdit(page,id){await page.locator(`[data-event-row="${id}"]`).getByRole('button',{name:'Edit',exact:true}).click();await page.locator('.editor-v1102').waitFor();}
async function cancel(page){await page.locator('.editor-v1102').getByRole('button',{name:'Cancel',exact:true}).click();await page.locator('.editor-v1102').waitFor({state:'hidden'});}
async function note(page,text){await page.locator('.editor-v1102 .note-toggle-v90').click();await page.getByRole('textbox',{name:'Notes',exact:true}).fill(text);}
const output='browser-test-results';fs.mkdirSync(output,{recursive:true});const reports=[];
for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 for(const zone of ['America/Chicago','America/Los_Angeles'])for(const live of [false,true]){
  const name=`${engine}-${zone.split('/')[1]}-${live?'live':'closed'}`,state=fixture(live),day=state.activeDay;
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:zone,serviceWorkers:'block'}),page=await context.newPage(),errors=[],dialogs=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
  try{
   await setup(page,context,state);
   const before=await waitState(page,s=>s.eventsByDay?.[day]?.some(e=>e.id===(live?'live':'short')));
   await page.screenshot({path:`${output}/${name}-graph.png`,fullPage:true});
   if(live){
    const liveRow=page.locator('[data-event-row="live"]');assert.match(await liveRow.innerText(),/Now/);assert.match(await liveRow.innerText(),/2h 5m/);
    await openEdit(page,'live');assert.equal(await page.getByLabel('Start time',{exact:true}).inputValue(),'15:15');assert.equal(await page.getByLabel('Start time',{exact:true}).isDisabled(),true);assert.match(await page.getByLabel('End time',{exact:true}).innerText(),/Now.*5:20/);assert.match(await page.locator('.selected-duration-live').innerText(),/2h 5m/);
    assert.equal(await page.locator('.editor-v1102 .graph-handle-v1102').count(),0);
    const visual=await visualChecks(page);await page.screenshot({path:`${output}/${name}-editor.png`,fullPage:true});
    await page.getByLabel('Location',{exact:true}).focus();await page.getByLabel('Description',{exact:true}).focus();
    await cancel(page);assert.deepEqual((await stored(page)).eventsByDay[day],before.eventsByDay[day]);
    await openEdit(page,'live');await note(page,'Delivery gate note — synthetic test');await page.locator('.editor-v1102 .save-main').click();
    const saved=await waitState(page,s=>s.eventsByDay?.[day]?.find(e=>e.id==='live')?.note==='Delivery gate note — synthetic test');
    const old=before.eventsByDay[day].find(e=>e.id==='live');assert.deepEqual(saved.eventsByDay[day],before.eventsByDay[day].map(e=>e.id==='live'?{...e,note:'Delivery gate note — synthetic test'}:e));assert.equal(saved.manualDrivingSession.active,true);assert.equal(saved.manualDrivingSession.eventId,'live');assert.equal(saved.currentStatus,'D');assert.equal(saved.eventsByDay[day].find(e=>e.id==='live').endMin,old.endMin);
    await page.reload();await page.locator('.drive-mode-log-btn').waitFor();await page.locator('.drive-mode-log-btn').click();await page.locator('[data-event-row="live"]').waitFor();assert.match(await page.locator('[data-event-row="live"]').innerText(),/2h 5m/);
    const reloaded=await stored(page);assert.equal(reloaded.manualDrivingSession.active,true);assert.equal(reloaded.eventsByDay[day].find(e=>e.id==='live').endMin,old.endMin);
    await openEdit(page,'live');await page.clock.setFixedTime(new Date('2026-09-06T21:21:00Z'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(150);assert.match(await page.locator('.selected-duration-live').innerText(),/2h 6m/);assert.match(await page.getByLabel('End time',{exact:true}).innerText(),/5:21/);
    await cancel(page);await openEdit(page,'live');await page.getByRole('button',{name:'Change current status',exact:true}).click();await page.locator('.editor-v1102').waitFor({state:'hidden'});assert.equal((await stored(page)).manualDrivingSession.active,true);
    reports.push({name,passed:true,checks:['live display','read-only open/cancel','focus/blur preserves GPS','note-only raw persistence','session remains active','reload','advancing clock','explicit status workflow','contrast','overflow'],visual});
   }else{
    assert.ok(await page.locator('.logbook-v1102 [data-relation="gap"]').count());assert.ok(await page.locator('.logbook-v1102 [data-relation="overlap"]').count());
    const g=page.locator('.logbook-v1102 [data-event-trace="short"]');assert.equal(await g.getAttribute('data-join-before'),'true');assert.equal(await g.getAttribute('data-join-after'),'false');assert.equal(await g.getAttribute('stroke-width'),'6');
    await page.locator('.logbook-v1102 [data-event-hit="short"]').click();await page.locator('[data-selected-link="short"]').waitFor();assert.equal(await page.locator('.editor-v1102').count(),0);
    await page.getByRole('button',{name:'Edit selected',exact:true}).click();await page.locator('.editor-v1102').waitFor();
    assert.equal(await page.getByLabel('Start time',{exact:true}).inputValue(),'15:15');assert.equal(await page.getByLabel('End time',{exact:true}).inputValue(),'15:16');assert.match(await page.locator('.selected-duration-live').innerText(),/\b1m\b/);assert.match(await page.locator('.selected-duration-live').innerText(),/3:16/);
    const visual=await visualChecks(page);await page.screenshot({path:`${output}/${name}-editor.png`,fullPage:true});
    await page.getByLabel('End time',{exact:true}).fill('15:20');assert.match(await page.locator('.selected-duration-live').innerText(),/\b5m\b/);assert.equal(await page.locator('.editor-v1102 [data-event-trace="short"]').getAttribute('data-join-after'),'true');
    await cancel(page);assert.deepEqual((await stored(page)).eventsByDay[day],before.eventsByDay[day]);
    await openEdit(page,'short');await page.getByLabel('End time',{exact:true}).fill('15:20');await page.locator('.editor-v1102 .save-main').click();const saved=await waitState(page,s=>s.eventsByDay?.[day]?.find(e=>e.id==='short')?.endMin===920);assert.deepEqual(saved.eventsByDay[day],before.eventsByDay[day].map(e=>e.id==='short'?{...e,endMin:920}:e));
    await page.reload();await page.locator('[data-event-row="midnight"]').waitFor();await openEdit(page,'midnight');assert.equal(await page.getByLabel('End time',{exact:true}).inputValue(),'00:00');assert.match(await page.locator('.selected-duration-live').innerText(),/5h 40m/);await cancel(page);
    await page.getByRole('button',{name:'Insert',exact:true}).click();await page.locator('.editor-v1102').waitFor();await page.getByLabel('Start time',{exact:true}).fill('23:59');await page.getByLabel('End time',{exact:true}).fill('00:00');assert.match(await page.locator('.editor-v1102 .save-main').innerText(),/1m/);assert.equal(await page.locator('.editor-v1102 .save-main').isDisabled(),false);await visualChecks(page);await page.screenshot({path:`${output}/${name}-insert-midnight.png`,fullPage:true});
    await page.getByLabel('End time',{exact:true}).fill('23:58');assert.equal(await page.locator('.editor-v1102 .save-main').isDisabled(),true);await cancel(page);
    reports.push({name,passed:true,checks:['true joins','real gaps','real overlaps','one-minute event','selection link','controls/duration/preview','cancel raw identity','save raw range only','reload','midnight end','insert validation','contrast','overflow'],visual});
   }
   assert.deepEqual(errors,[]);console.log('PASS — '+name);
  }catch(error){await page.screenshot({path:`${output}/${name}-FAILED.png`,fullPage:true}).catch(()=>{});const fail={name,passed:false,error:String(error),stack:error.stack,errors,dialogs,text:await page.locator('body').innerText().catch(()=>''),state:await stored(page).catch(()=>null)};reports.push(fail);fs.writeFileSync(`${output}/${name}-failure.json`,JSON.stringify(fail,null,2));console.error('FAIL — '+name+': '+String(error));}
  finally{await context.close();}
 }
 await browser.close();
}
fs.writeFileSync(`${output}/logbook-editor-v1102.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),reports.filter(r=>!r.passed).map(r=>r.name+': '+r.error).join('\n'));console.log('PASS — 8 compiled-app mobile editor scenarios in Chromium and WebKit');
