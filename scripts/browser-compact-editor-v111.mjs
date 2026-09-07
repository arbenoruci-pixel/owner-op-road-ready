// Compiled-app integration only: synthetic browser records, intercepted APIs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output=`browser-test-results/compact-${process.env.TEST_ORIGIN?'production':'local'}`;fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000004',email:'compact-fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const reports=[];
function fixture(kind){const live=kind!=='closed',day=live?'2026-09-06':'2026-07-10',status=kind==='live-D'?'D':'ON';return {view:'day',activeDay:day,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'TEST',trailer:'TEST'},driverProfile:{name:'Synthetic Driver'},carrierName:'Synthetic Carrier',mainOfficeAddress:'Test Office',currentTrailer:'TEST',currentStatus:live?status:'OFF',currentLocation:{city:'Test City',state:'IL'},manualDrivingSession:kind==='live-D'?{active:true,status:'D',eventId:'target',startDay:day,startedAt:'2026-09-06T19:15:00Z'}:null,eventsByDay:{[day]:[{id:'rest',status:'OFF',startMin:0,endMin:915,city:'Test City',state:'IL',note:'Off Duty'},{id:'target',status,startMin:915,endMin:916,city:'Test City',state:'IL',note:status==='D'?'Driving':'Fuel',description:'Readable synthetic description',source:live?'live_status':'manual',lat:41.1,lng:-87.1,gpsAccuracy:5,locationSource:'gps'}]},certifyStatus:{[day]:'Needs signature'},signatureByDay:{},inspectionByDay:{},routeLegsByDay:{},formByDay:{},loadGuidesById:{},dotWallet:{documents:{}}};}
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state);};};}));}
async function waitState(page,condition){for(let n=0;n<100;n++){const s=await stored(page);if(s&&condition(s))return s;await page.waitForTimeout(100);}throw Error('Compact fixture persistence timeout');}
async function openLog(page){await page.locator('.drive-mode-log-btn, .logbook-ui-v110 .log-graph-v110').first().waitFor({timeout:30000});if(await page.locator('.drive-mode-log-btn').isVisible())await page.locator('.drive-mode-log-btn').click();await page.locator('[data-log-event-id=target]').waitFor();}
async function setup(page,context,state){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});assert.equal(route.request().method(),'GET');return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic test: all account writes blocked'},headers});});
 await page.clock.setFixedTime(new Date('2026-09-06T21:20:00Z'));await page.goto(origin+'/_not-found');
 await page.evaluate(async({schemas,state,session})=>{localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const [name,schema]of Object.entries(schemas)){const [key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};};});},{schemas,state,session});
 await page.goto(origin);await openLog(page);
}
function contrast(a,b){const lum=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i],0),aa=lum(a),bb=lum(b);return (Math.max(aa,bb)+.05)/(Math.min(aa,bb)+.05);}
async function inspect(page){const r=await page.locator('.editor-compact-v111').evaluate(root=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};const form=root.querySelector('.editor-form-v85');return {viewport:{width:innerWidth,height:innerHeight},root:rect(root),head:rect(root.querySelector('.sheet-head')),graph:rect(root.querySelector('.compact-graph-panel-v111')),svg:rect(root.querySelector('svg.log-graph')),footer:rect(root.querySelector('.compact-editor-footer-v111')),scrollWidth:form.scrollWidth,width:form.clientWidth,handles:[...root.querySelectorAll('.graph-handle-large-v110')].map(rect),fields:[...root.querySelectorAll('input:not([type=checkbox]),textarea,.reason-pills button,.insert-reason-grid button')].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const s=getComputedStyle(e);return {text:e.getAttribute('aria-label')||e.textContent,color:s.webkitTextFillColor==='currentcolor'?s.color:(s.webkitTextFillColor||s.color),background:s.backgroundColor,font:s.fontSize,...rect(e)};})};});
 assert.ok(r.svg.width>=r.viewport.width-12,'Graph must be almost full screen width');assert.ok(r.graph.y>=r.head.bottom-1&&r.graph.y<=r.head.bottom+4,'Graph must immediately follow header');assert.ok(r.footer.bottom<=r.viewport.height+1,'Footer visible');assert.ok(r.scrollWidth<=r.width+1,'Form horizontal overflow');
 for(const h of r.handles){assert.ok(h.height>=44,'Real 44px grabber');assert.ok(h.x>=0&&h.right<=r.viewport.width,'Grabber clipped');}
 if(r.handles.length===2)assert.ok(r.handles[0].right+4<=r.handles[1].x,'Short-event handles overlap');
 for(const f of r.fields){assert.ok(f.x>=-1&&f.right<=r.viewport.width+1,'Field clipped: '+f.text);assert.ok(contrast(f.color,f.background)>=4.5,'Contrast: '+f.text);}
 return r;
}
for(const [name,type]of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 for(const kind of ['closed','live-ON','live-D']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'America/Los_Angeles',colorScheme:'dark',serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  try{
   const s=fixture(kind),day=s.activeDay;await setup(page,context,s);const before=await waitState(page,s=>s.eventsByDay?.[day]?.some(e=>e.id==='target'));
   await page.locator('.logbook-ui-v110 [data-hit-event=target]').click();await page.locator('.editor-compact-v111').waitFor();
   const geometry=await inspect(page);await page.screenshot({path:`${output}/${name}-${kind}-390.png`,fullPage:false});
   await page.setViewportSize({width:320,height:740});await page.waitForTimeout(100);await inspect(page);await page.screenshot({path:`${output}/${name}-${kind}-320.png`,fullPage:false});await page.setViewportSize({width:390,height:844});
   const graphBefore=await page.locator('.compact-graph-panel-v111').boundingBox();await page.locator('.editor-form-v85').evaluate(e=>e.scrollTop=e.scrollHeight);assert.deepEqual(await page.locator('.compact-graph-panel-v111').boundingBox(),graphBefore,'Graph stays visible while form scrolls');await page.locator('.editor-form-v85').evaluate(e=>e.scrollTop=0);
   await page.getByRole('button',{name:'Full screen',exact:true}).click();assert.equal(await page.locator('.graph-focus-v111').count(),1);await page.screenshot({path:`${output}/${name}-${kind}-graph-focus.png`,fullPage:false});await page.getByRole('button',{name:'Done graph',exact:true}).click();
   if(kind==='closed'){
    const end=page.getByRole('slider',{name:'end time handle',exact:true});const b=await end.boundingBox();
    const svgWidth=(await page.locator('.editor-compact-v111 svg').boundingBox()).width;
    const x=Math.round(b.x+b.width/2),y=Math.round(b.y+b.height/2),expectedMinute=Math.round(916+12/(svgWidth*.894)*1440);
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+12,y,{steps:8});await page.mouse.up();
    // WebKit can deliver the final pointer update after mouse.up resolves. Read
    // both controls in one rendered frame and require the exact dispatched delta.
    await page.waitForFunction(expected=>{
      const root=document.querySelector('.editor-compact-v111');
      const input=root?.querySelector('input[aria-label="End time"]');
      const handle=root?.querySelector('[role="slider"][data-edge="end"]');
      const [h,m]=String(input?.value||'').split(':').map(Number);
      return h*60+m===expected && Number(handle?.getAttribute('aria-valuenow'))===expected;
    },expectedMinute,{timeout:5000});
    const time=await page.getByLabel('End time',{exact:true}).inputValue();assert.notEqual(time,'15:16');assert.equal(Number(time.slice(0,2))*60+Number(time.slice(3)),expectedMinute);assert.equal(Number(await end.getAttribute('aria-valuenow')),expectedMinute);
    const start=page.getByRole('slider',{name:'start time handle',exact:true});await start.focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.getByLabel('Start time',{exact:true}).inputValue(),'15:14');
    await page.locator('.cancel-main').click();assert.deepEqual((await stored(page)).eventsByDay[day],before.eventsByDay[day]);
    await page.locator('[data-log-event-id=target] .blue-edit').click();const handle=page.getByRole('slider',{name:'end time handle',exact:true});await handle.focus();await page.keyboard.press('ArrowRight');await page.locator('.save-main').click();const saved=await waitState(page,s=>s.eventsByDay[day].find(e=>e.id==='target').endMin===917);assert.deepEqual(saved.eventsByDay[day],before.eventsByDay[day].map(e=>e.id==='target'?{...e,endMin:917}:e));
    await page.reload();await openLog(page);await page.getByRole('button',{name:'Insert',exact:true}).click();await page.locator('.editor-compact-v111').waitFor();await page.getByLabel('Start time',{exact:true}).fill('23:59');await page.locator('.midnight-end-v110 input').check();await inspect(page);await page.screenshot({path:`${output}/${name}-insert-midnight.png`,fullPage:false});assert.equal(await page.getByRole('slider',{name:'end time handle',exact:true}).getAttribute('aria-valuenow'),'1440');await page.locator('.cancel-main').click();
   }else{
    assert.equal(await page.getByRole('slider').count(),0,'No live timing drag');assert.ok(await page.getByLabel('Start time',{exact:true}).isDisabled());
    await page.getByLabel('Location',{exact:true}).focus();await page.getByLabel('Description',{exact:true}).focus();assert.ok(await page.locator('.save-main').isDisabled());
    await page.locator('.note-toggle-v90').click();await page.getByLabel('Notes',{exact:true}).fill('Compact live note');await page.locator('.save-main').click();const saved=await waitState(page,s=>s.eventsByDay[day].find(e=>e.id==='target').note==='Compact live note');assert.equal(saved.eventsByDay[day].find(e=>e.id==='target').endMin,916);assert.equal(saved.eventsByDay[day].find(e=>e.id==='target').lat,41.1);assert.equal(saved.currentStatus,before.currentStatus);assert.deepEqual(saved.manualDrivingSession,before.manualDrivingSession);
   }
   assert.deepEqual(errors,[]);reports.push({browser:name,kind,passed:true,geometry,pageErrors:errors});console.log('PASS — compact '+name+' '+kind+' layout, draft controls and real browser interaction');
  }catch(error){await page.screenshot({path:`${output}/${name}-${kind}-FAILED.png`,fullPage:false}).catch(()=>{});reports.push({browser:name,kind,passed:false,error:String(error),stack:error.stack,errors});console.error(error);}
  finally{await context.close();}
 }
 await browser.close();
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports.filter(r=>!r.passed)));
