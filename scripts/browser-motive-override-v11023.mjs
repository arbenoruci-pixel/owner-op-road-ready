// Compiled-app integration: synthetic browser records only; external account APIs are intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output=`browser-test-results/motive-override-${process.env.TEST_ORIGIN?'production':'local'}`;fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000023',email:'override-fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const day='2026-07-10';
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Willowbrook',state:'IL',source:'manual',...extra});
function fixture(auto=false){const events=[row('off1','OFF',0,600,{note:'Off Duty'}),row('target','ON',600,660,{note:'Fuel',reasons:['Fuel']}),row('off2','OFF',660,720,{note:'Off Duty'}),auto?row('auto','D',720,780,{note:'Driving',source:'gps_drive'}):row('sb','SB',720,780,{note:'Sleeper'}),row('rest','OFF',780,1440,{note:'Off Duty'})];return {view:'day',activeDay:day,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'TEST',trailer:'TEST'},driverProfile:{name:'Synthetic Driver'},carrierName:'Synthetic Carrier',mainOfficeAddress:'Test Office',currentTrailer:'TEST',currentStatus:'OFF',currentLocation:{city:'Willowbrook',state:'IL'},eventsByDay:{[day]:events},certifyStatus:{[day]:'Needs signature'},signatureByDay:{},inspectionByDay:{},routeLegsByDay:{},formByDay:{},loadGuidesById:{},dotWallet:{documents:{}}};}
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state);};q.onerror=()=>reject(q.error);};}));}
async function waitState(page,condition){for(let n=0;n<100;n++){const s=await stored(page);if(s&&condition(s))return s;await page.waitForTimeout(100);}throw Error('Override fixture persistence timeout');}
async function openLog(page){await page.locator('.logbook-ui-v110 .log-graph-v110').waitFor({timeout:30000});await page.locator('[data-log-event-id=target]').waitFor();}
async function setup(page,context,state){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});assert.equal(route.request().method(),'GET','browser override test cannot send app writes');return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic override test: external access blocked'},headers});});
 await page.goto(origin+'/_not-found');await page.evaluate(async({schemas,state,session})=>{localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const [name,schema]of Object.entries(schemas)){const [key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{schemas,state,session});await page.goto(origin);await openLog(page);
}
async function openTarget(page){await page.locator('[data-log-event-id=target] .blue-edit').click();await page.locator('.editor-compact-v111').waitFor();}
function luminance(s){return s.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);}
async function design(page){
 const info=await page.locator('.editor-compact-v111').evaluate(root=>({width:innerWidth,overflow:root.querySelector('.editor-form-v85').scrollWidth>root.querySelector('.editor-form-v85').clientWidth+1,chips:[...root.querySelectorAll('.quick-activities-v11023 button')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {text:e.textContent.trim(),height:r.height,left:r.left,right:r.right,color:s.webkitTextFillColor==='currentcolor'?s.color:s.webkitTextFillColor,background:s.backgroundColor,pressed:e.getAttribute('aria-pressed')};})}));
 assert.equal(info.overflow,false);for(const c of info.chips){assert.ok(c.height>=44);assert.ok(c.left>=0&&c.right<=info.width+1);assert.ok(['true','false'].includes(c.pressed));const a=luminance(c.color),b=luminance(c.background);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,'Chip contrast '+c.text);}return info;
}
async function quick(page,label){await page.locator('.quick-activities-v11023').getByRole('button',{name:label,exact:true}).click();}
const reports=[];
for(const [name,type]of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 for(const scenario of ['override','insert','protected']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:scenario==='insert'?'Europe/Belgrade':'America/Los_Angeles',colorScheme:'dark',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  try{
   const initial=fixture(scenario==='protected');await setup(page,context,initial);const original=await stored(page);
   if(scenario==='override'){
    await openTarget(page);const quickRoot=page.locator('.quick-activities-v11023');
    assert.equal(await page.locator('details.compact-activities-v111').count(),0);
    assert.equal(await page.locator('.editor-compact-v111 [data-editor-boundary]').count(),2);
    const h=page.getByRole('slider',{name:'end time handle',exact:true}),r=await h.boundingBox(),svg=await page.locator('.editor-compact-v111 svg').boundingBox();
    // Both engines dispatch integral CSS pointer coordinates. A 24-hour phone
    // graph maps several minutes to one pixel, so verify that exact pixel delta
    // first, then use the existing one-minute keyboard nudges for 12:30 exactly.
    const x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2),dx=Math.round(90*svg.width*.894/1440);
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y,{steps:12});await page.mouse.up();
    const expectedMinute=660+Math.round(dx/(svg.width*.894)*1440);
    assert.equal(Number(await h.getAttribute('aria-valuenow')),expectedMinute);
    const observed=await page.getByLabel('End time',{exact:true}).inputValue();
    assert.equal(Number(observed.slice(0,2))*60+Number(observed.slice(3)),expectedMinute);
    assert.ok(Math.abs(750-expectedMinute)<=Math.ceil(1440/(svg.width*.894)));
    await h.focus();for(let n=0;n<Math.abs(750-expectedMinute);n++)await page.keyboard.press(expectedMinute<750?'ArrowRight':'ArrowLeft');
    assert.equal(await page.getByLabel('End time',{exact:true}).inputValue(),'12:30');
    assert.equal(await page.locator('.editor-compact-v111 .graph-discontinuity[data-kind=Overlap]').count(),0);
    assert.equal(await page.locator('.editor-compact-v111 .graph-discontinuity[data-kind=Gap]').count(),0);
    await page.locator('.cancel-main').click();assert.deepEqual((await stored(page)).eventsByDay,original.eventsByDay);assert.equal((await stored(page)).logbookEditHistoryByDay,undefined);
    await openTarget(page);await quick(page,'PTI');await quick(page,'Delivery');await quick(page,'Fuel');
    assert.equal(await quickRoot.locator('button[aria-pressed=true]').count(),2);
    await page.getByLabel('End time',{exact:true}).fill('12:30');await design(page);
    await page.locator('.editor-form-v85').evaluate(e=>e.scrollTop=80);
    await page.screenshot({path:`${output}/${name}-override-chips.png`,fullPage:false});
    await page.setViewportSize({width:320,height:740});await page.waitForTimeout(120);await design(page);await page.screenshot({path:`${output}/${name}-chips-320.png`,fullPage:false});await page.setViewportSize({width:390,height:844});
    await page.locator('.save-main').click();const saved=await waitState(page,s=>s.eventsByDay[day].find(e=>e.id==='target').endMin===750);
    assert.equal(saved.eventsByDay[day].find(e=>e.id==='off2'),undefined);assert.equal(saved.eventsByDay[day].find(e=>e.id==='sb').startMin,750);
    assert.deepEqual(new Set(saved.eventsByDay[day].find(e=>e.id==='target').reasons),new Set(['Pre-trip inspection','Delivery / Unloading']));
    assert.deepEqual(saved.logbookEditHistoryByDay[day][0].beforeEvents,original.eventsByDay[day]);
    await page.reload();await openLog(page);await openTarget(page);assert.equal(await quickRoot.getByRole('button',{name:'PTI',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await quickRoot.getByRole('button',{name:'Delivery',exact:true}).getAttribute('aria-pressed'),'true');
    await quick(page,'Delivery');await quick(page,'Fuel');await page.locator('.save-main').click();const paired=await waitState(page,s=>s.eventsByDay[day].find(e=>e.id==='target')?.reasons?.includes('Fuel'));
    assert.deepEqual(new Set(paired.eventsByDay[day].find(e=>e.id==='target').reasons),new Set(['Pre-trip inspection','Fuel']));assert.equal(paired.logbookEditHistoryByDay[day].length,1);
    await page.reload();await openLog(page);assert.match(await page.locator('[data-log-event-id=target]').innerText(),/Fuel/);
   }else if(scenario==='insert'){
    await page.getByRole('button',{name:'Insert',exact:true}).click();await page.locator('.editor-compact-v111').waitFor();await page.getByLabel('Start time',{exact:true}).fill('15:00');await page.getByLabel('End time',{exact:true}).fill('15:30');
    await quick(page,'PTI');await quick(page,'Fuel');await quick(page,'Fuel');assert.equal(await page.locator('.quick-activities-v11023 button[aria-pressed=true]').count(),1);await quick(page,'Fuel');await design(page);
    await page.screenshot({path:`${output}/${name}-insert-chips.png`,fullPage:false});await page.locator('.save-main').click();const saved=await waitState(page,s=>s.eventsByDay[day].some(e=>e.startMin===900&&e.endMin===930));
    const e=saved.eventsByDay[day].find(e=>e.startMin===900&&e.endMin===930);assert.deepEqual(new Set(e.reasons),new Set(['Pre-trip inspection','Fuel']));assert.match(e.note,/Pre-trip inspection.*Fuel/);assert.equal(saved.eventsByDay[day].filter(r=>r.id!==e.id).some(r=>r.startMin<930&&r.endMin>900),false);
    assert.equal(saved.logbookEditHistoryByDay[day][0].kind,'insert');await page.reload();await openLog(page);assert.ok((await stored(page)).eventsByDay[day].some(row=>row.id===e.id));
   }else{
    await openTarget(page);await page.getByLabel('End time',{exact:true}).fill('12:15');await page.locator('.motive-override-help-v11023.blocked').waitFor();assert.match(await page.locator('.motive-override-help-v11023').innerText(),/Automatic Driving time cannot be overwritten/);assert.equal(await page.locator('.save-main').isDisabled(),true);await page.screenshot({path:`${output}/${name}-protected-driving.png`,fullPage:false});await page.locator('.cancel-main').click();
    await page.getByRole('button',{name:'Insert',exact:true}).click();await page.locator('.editor-compact-v111').waitFor();await page.getByLabel('Start time',{exact:true}).fill('12:10');await page.getByLabel('End time',{exact:true}).fill('12:20');assert.equal(await page.locator('.save-main').isDisabled(),true);assert.match(await page.locator('.editor-compact-v111 [role=alert]').innerText(),/Automatic Driving/);await page.locator('.cancel-main').click();assert.deepEqual((await stored(page)).eventsByDay,original.eventsByDay);
   }
   assert.deepEqual(errors,[]);reports.push({browser:name,scenario,passed:true,origin,pageErrors:errors});console.log('PASS — '+name+' '+scenario+' override/chips at '+origin);
  }catch(error){await page.screenshot({path:`${output}/${name}-${scenario}-FAILED.png`,fullPage:false}).catch(()=>{});reports.push({browser:name,scenario,passed:false,error:String(error),stack:error.stack,pageErrors:errors});console.error(error);}
  finally{await context.close();}
 }
 await browser.close();
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports.filter(r=>!r.passed)));
