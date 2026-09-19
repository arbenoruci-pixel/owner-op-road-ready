import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {chromium,webkit} from 'playwright';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output='browser-test-results/unified-duty-v110378';fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000078',email:'duty-fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const day='2026-09-18',prior='2026-09-17';
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Onalaska',state:'WI',source:'manual',note:status==='OFF'?'Off Duty':status==='D'?'Driving':'On Duty',...extra});
function fixture(){return {view:'day',activeDay:day,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'TEST',trailer:'CURRENT'},driverProfile:{name:'Synthetic Driver'},carrierName:'Synthetic Carrier',mainOfficeAddress:'Test Office',currentTrailer:'CURRENT',equipment:{type:'dry_van',trailer:'CURRENT'},currentStatus:'OFF',currentReason:'Off Duty',currentLocation:{city:'Willowbrook',state:'IL'},
 eventsByDay:{[prior]:[row('prior','OFF',0,1440)], [day]:[
 row('rest','OFF',0,704),row('pickup','ON',704,705,{description:'Load TRIP-A · To Milwaukee, WI',note:'Hook / Pickup Trailer · Trailer T1',reasons:[],shippingDocs:'TRIP-B',loadNo:'TRIP-B',bol:'BOL-A',destination:'Dates',destinationState:'WI',hookedTrailer:'T1',loadDetailsExplicit:true,integrityRepairedAt:100}),
 row('drive','D',705,929),row('drop','ON',929,947,{city:'Milwaukee',note:'Drop Load / Trailer · Trailer T1',reasons:[],droppedTrailer:'T1'}),row('after','OFF',947,1440,{city:'Milwaukee'})]},
 routeLegsByDay:{[day]:[{id:'plan',day,pickupDay:day,pickupEventId:'',pickupMin:0,fromCity:'Onalaska',fromState:'WI',toCity:'Milwaukee',toState:'WI',loadNo:'TRIP-A',shippingDocs:'TRIP-A',status:'open',source:'manual_form'},{id:'recorded-leg',day,pickupDay:day,pickupEventId:'pickup',pickupMin:704,fromCity:'Onalaska',fromState:'WI',toCity:'Dates',toState:'WI',loadNo:'TRIP-B',shippingDocs:'TRIP-B',status:'open',source:'pickup_event'}]},
 certifyStatus:{[day]:'Needs signature'},signatureByDay:{},inspectionByDay:{},formByDay:{},manualMilesByDay:{[day]:251},logbookEditHistoryByDay:{},loadInfo:{},loadGuidesById:{},dotWallet:{documents:{}}};}
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state);};q.onerror=()=>reject(q.error);};}));}
async function waitState(page,fn){for(let i=0;i<100;i++){const s=await stored(page);if(s&&fn(s))return s;await page.waitForTimeout(100);}throw Error('Saved fixture state did not reach expected value');}
async function setup(page,context,state=fixture()){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});assert.equal(route.request().method(),'GET');return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic test blocks external access'},headers});});
 await page.clock.setFixedTime(new Date('2026-09-19T12:00:00Z'));await page.goto(origin+'/_not-found');
 await page.evaluate(async({schemas,state,session})=>{localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const[name,schema]of Object.entries(schemas)){const[key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{schemas,state,session});
 await page.goto(origin);await page.locator('[data-log-event-id=drop]').waitFor({timeout:30000});
}
async function edit(page,id){const row=page.locator(`[data-log-event-id="${id}"]`);if(!await row.locator('.motive-edit-reveal-v11027').count())await row.click();await row.locator('.motive-edit-reveal-v11027').click();await page.locator('[data-duty-mode=recorded].dd-root').waitFor();}
async function design(page){return page.locator('.dd-root').evaluate(root=>{const body=root.querySelector('.dd-body'),save=root.querySelector('.dd-footer').getBoundingClientRect();return {unified:root.dataset.dutyForm,labels:[...root.querySelectorAll('.dd-activity-grid button')].map(b=>b.getAttribute('aria-label')),background:getComputedStyle(root.querySelector('.dd-status-grid')).backgroundColor,overflow:body.scrollWidth>body.clientWidth+1,footerVisible:save.bottom<=innerHeight+1,buttons:[...root.querySelectorAll('.dd-activity-grid button')].map(b=>b.getBoundingClientRect().height)};});}
async function notesRegression(browser,name){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();
 const state=fixture(),target=state.eventsByDay[day].find(e=>e.id==='drop');
 target.note='Gate queue · Trailer T1';target.reasons=['Fuel','Custom work'];
 try{
  await setup(page,context,state);const before=await stored(page),root=page.locator('.dd-root');
  const row=s=>s.eventsByDay[day].find(e=>e.id==='drop');
  await edit(page,'drop');await root.getByLabel('Notes',{exact:true}).fill('First note');
  await root.getByLabel('Notes',{exact:true}).fill('Updated gate note');
  for(const reason of target.reasons)assert.equal(await root.getByRole('button',{name:reason,exact:true}).getAttribute('aria-pressed'),'true','Notes must preserve '+reason);
  await root.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual((await stored(page)).eventsByDay,before.eventsByDay);
  await edit(page,'drop');await root.getByLabel('Notes',{exact:true}).fill('Updated gate note');await root.getByRole('button',{name:'Save changes',exact:true}).click();
  const saved=await waitState(page,s=>row(s)?.note==='Updated gate note');
  assert.deepEqual(row(saved).reasons,target.reasons);
  for(const key of ['status','startMin','endMin','city','state','droppedTrailer','loadNo','shippingDocs','bol','destination','description'])assert.deepEqual(row(saved)[key],row(before)[key],key);
  assert.deepEqual(saved.routeLegsByDay,before.routeLegsByDay);assert.deepEqual(saved.eventsByDay[prior],before.eventsByDay[prior]);
  const audit=saved.logbookEditHistoryByDay[day].at(-1);assert.deepEqual(row({eventsByDay:{[day]:audit.beforeEvents}}),row(before));assert.deepEqual(row({eventsByDay:{[day]:audit.afterEvents}}),row(saved));
  await page.reload();await edit(page,'drop');
  for(const reason of target.reasons)assert.equal(await root.getByRole('button',{name:reason,exact:true}).getAttribute('aria-pressed'),'true');
  await root.getByRole('button',{name:'Fuel',exact:true}).click();await root.getByLabel('Notes',{exact:true}).fill('Driver removed Fuel');
  assert.equal(await root.getByRole('button',{name:'Fuel',exact:true}).getAttribute('aria-pressed'),'false');
  await root.getByRole('button',{name:'Save changes',exact:true}).click();const deselected=await waitState(page,s=>row(s)?.note==='Driver removed Fuel');assert.deepEqual(row(deselected).reasons,['Custom work']);
  await page.reload();await edit(page,'drop');assert.equal(await root.getByRole('button',{name:'Custom work',exact:true}).getAttribute('aria-pressed'),'true');
  await root.getByRole('button',{name:'Custom work',exact:true}).click();await root.getByLabel('Notes',{exact:true}).fill('Driver removed remaining activity');
  await root.getByRole('button',{name:'Save changes',exact:true}).click();const cleared=await waitState(page,s=>row(s)?.note==='Driver removed remaining activity');assert.deepEqual(row(cleared).reasons,[]);
  await page.reload();await edit(page,'drop');await root.getByRole('button',{name:'Fuel',exact:true}).click();await root.getByRole('button',{name:'OFF',exact:true}).click();await root.getByLabel('Notes',{exact:true}).fill('Off duty note');
  await root.getByRole('button',{name:'Save changes',exact:true}).click();const off=await waitState(page,s=>row(s)?.status==='OFF');assert.deepEqual(row(off).reasons,[]);
  console.log('PASS — '+name+' Notes preserve stored/legacy reasons through Save/reload and respect explicit deselection/status changes');
 }finally{await context.close();}
}
const reports=[];
for(const[name,type]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/Chicago',serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await notesRegression(browser,name);
  await setup(page,context);const baseline=await stored(page);await edit(page,'drop');const root=page.locator('.dd-root');
  assert.equal(await root.getByRole('button',{name:'Drop Load / Trailer',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await root.getByLabel('Trailer being dropped',{exact:true}).inputValue(),'T1');
  assert.equal(await root.getByLabel('Location',{exact:true}).inputValue(),'Milwaukee, WI');
  const recordedDesign=await design(page);assert.equal(recordedDesign.unified,'unified');assert.equal(recordedDesign.overflow,false);assert.equal(recordedDesign.footerVisible,true);assert.ok(recordedDesign.buttons.every(h=>h>=44));
  let confirmedGps=false;page.once('dialog',async d=>{assert.match(d.message(),/recorded event/i);confirmedGps=true;await d.dismiss();});await root.getByRole('button',{name:'Use GPS location'}).click();assert.ok(confirmedGps);assert.equal(await root.getByLabel('Location',{exact:true}).inputValue(),'Milwaukee, WI');
  await page.screenshot({path:`${output}/${name}-recorded.png`});await page.setViewportSize({width:320,height:740});assert.equal((await design(page)).overflow,false);await page.setViewportSize({width:390,height:844});
  await root.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual((await stored(page)).eventsByDay[day],baseline.eventsByDay[day]);
  await page.getByRole('button',{name:'Status',exact:true}).click();await page.locator('.dd-root[data-duty-mode=current]').waitFor();await root.getByRole('button',{name:'ON',exact:true}).click();
  const currentDesign=await design(page);assert.deepEqual(currentDesign.labels,recordedDesign.labels);assert.equal(currentDesign.background,recordedDesign.background);assert.equal(currentDesign.overflow,false);assert.equal(currentDesign.footerVisible,true);
  await root.getByRole('button',{name:'Drop Load / Trailer',exact:true}).click();await root.getByLabel('Trailer being dropped',{exact:true}).waitFor();
  await page.screenshot({path:`${output}/${name}-current.png`});await root.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual((await stored(page)).eventsByDay[day],baseline.eventsByDay[day]);
  await edit(page,'pickup');await root.getByText('Recorded pickup needs review',{exact:true}).waitFor();
  page.once('dialog',d=>d.accept());await root.getByRole('button',{name:'Use recorded pickup details',exact:true}).click();
  assert.equal(await root.getByLabel('Load / order #',{exact:true}).inputValue(),'TRIP-A');assert.equal(await root.getByLabel('BOL #',{exact:true}).inputValue(),'BOL-A');assert.equal(await root.getByLabel('Going to',{exact:true}).inputValue(),'Milwaukee, WI');
  await page.screenshot({path:`${output}/${name}-reviewed-draft.png`});await root.getByRole('button',{name:'Save changes',exact:true}).click();
  const saved=await waitState(page,s=>s.eventsByDay[day].find(e=>e.id==='pickup')?.destination==='Milwaukee, WI');const e=saved.eventsByDay[day].find(e=>e.id==='pickup');
  assert.equal(e.startMin,704);assert.equal(e.endMin,705);assert.equal(e.loadNo,'TRIP-A');assert.equal(e.bol,'BOL-A');assert.equal(saved.routeLegsByDay[day].find(r=>r.id==='recorded-leg').toCity,'Milwaukee');
  assert.deepEqual(saved.eventsByDay[prior],baseline.eventsByDay[prior]);assert.deepEqual(saved.signatureByDay,baseline.signatureByDay);assert.deepEqual(saved.manualMilesByDay,baseline.manualMilesByDay);assert.deepEqual(saved.routeLegsByDay[day].find(r=>r.id==='plan'),baseline.routeLegsByDay[day].find(r=>r.id==='plan'));
  assert.equal(saved.logbookEditHistoryByDay[day].at(-1).beforeEvents.find(e=>e.id==='pickup').destination,'Dates');
  await page.reload();await page.locator('[data-log-event-id=drop]').waitFor();const reopened=await stored(page);assert.equal(reopened.eventsByDay[day].find(e=>e.id==='pickup').destination,'Milwaukee, WI');
  await edit(page,'pickup');await root.getByLabel('Going to',{exact:true}).fill('Reviewed City, WI');await root.getByRole('button',{name:'Save changes',exact:true}).click();
  const changed=await waitState(page,s=>s.eventsByDay[day].find(e=>e.id==='pickup')?.destination==='Reviewed City, WI');const final=changed.eventsByDay[day].find(e=>e.id==='pickup');assert.equal(final.loadNo,'TRIP-A');assert.equal(final.shippingDocs,'TRIP-A');assert.equal(final.bol,'BOL-A');assert.equal(final.startMin,704);assert.equal(final.endMin,705);
  assert.deepEqual(errors,[]);reports.push({browser:name,passed:true,checks:['shared form and labels','recorded Drop restored','historical GPS confirmation','320px layout','Cancel read-only','explicit source correction','audit and route sync','reopen','destination leaves BOL/time intact']});console.log('PASS — '+name+' unified current/recorded Duty Form and protected pickup correction');
 }catch(error){await page.screenshot({path:`${output}/${name}-FAILED.png`}).catch(()=>{});fs.writeFileSync(`${output}/${name}-failure.json`,JSON.stringify({error:String(error),stack:error.stack,state:await stored(page).catch(()=>null),errors},null,2));reports.push({browser:name,passed:false,error:String(error)});console.error(error);}
 finally{await context.close();await browser.close();}
}
fs.writeFileSync(output+'/results.json',JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports));
