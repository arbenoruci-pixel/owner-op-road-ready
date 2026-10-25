import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {chromium,webkit} from 'playwright';
import {buildDotOfficerCheck} from '../../source/src/core/dot/dotOfficerCheckEngine.js';
import {fixtureCorsHeaders,fulfillLocalAccountSettings,installLocalAccountSettings} from '../test-support/cloud-fixture.mjs';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output='browser-test-results/simple-pickup';fs.mkdirSync(output,{recursive:true});
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
 // Keep this local duty fixture behind the current synthetic device-session gate.
 await installLocalAccountSettings(context,user);
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});assert.equal(route.request().method(),'GET');return route.continue();}if(await fulfillLocalAccountSettings(route,origin,user))return;const headers=await fixtureCorsHeaders(route.request(),origin);if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic test blocks external access'},headers});});
 await page.clock.setFixedTime(new Date('2026-09-19T12:00:00Z'));await page.goto(origin+'/_not-found');
 await page.evaluate(async({schemas,state,session})=>{localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const[name,schema]of Object.entries(schemas)){const[key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{schemas,state,session});
 await page.goto(origin);await page.locator('[data-log-event-id=drop]').waitFor({timeout:30000});
}
async function edit(page,id){const row=page.locator(`[data-log-event-id="${id}"]`);if(!await row.locator('.motive-edit-reveal-v11027').count())await row.click();await row.locator('.motive-edit-reveal-v11027').click();await page.locator('[data-duty-mode=recorded].dd-root').waitFor();}
async function design(page){return page.locator('.dd-root').evaluate(root=>{const body=root.querySelector('.dd-body'),save=root.querySelector('.dd-footer').getBoundingClientRect();return {unified:root.dataset.dutyForm,labels:[...root.querySelectorAll('.dd-activity-grid button')].map(b=>b.getAttribute('aria-label')),background:getComputedStyle(root.querySelector('.dd-status-grid')).backgroundColor,overflow:body.scrollWidth>body.clientWidth+1,footerVisible:save.bottom<=innerHeight+1,buttons:[...root.querySelectorAll('.dd-activity-grid button')].map(b=>b.getBoundingClientRect().height)};});}
for(const[name,type]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true,...(name==='webkit'&&process.env.WEBKIT_EXECUTABLE?{executablePath:process.env.WEBKIT_EXECUTABLE}:{})});
 try{for(const legacy of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
   const s=fixture(),target=s.eventsByDay[day].find(e=>e.id==='pickup');
   Object.assign(target,{note:'Drop Load / Trailer · Hook / Pickup Trailer',description:'',shippingDocs:legacy?'LEGACY-BOL':'',loadNo:'BROKER-ONLY',bol:legacy?'':'00787889',po:'PO-UNCHANGED',destination:'Dayton, NJ',destinationState:'NJ',integrityRepairedAt:undefined});
   s.routeLegsByDay={};s.signatureByDay={[prior]:'preserved-prior-signature'};
   await setup(page,context,s);const before=await stored(page),root=page.locator('.dd-root'),get=s=>s.eventsByDay[day].find(e=>e.id==='pickup');
   await edit(page,'pickup');
   const fields=root.locator('[data-duty-section=load]');assert.equal(await fields.locator('input').count(),2);
   assert.equal(await fields.getByLabel('BOL #',{exact:true}).inputValue(),legacy?'LEGACY-BOL':'00787889');
   assert.equal(await fields.getByLabel('Going to',{exact:true}).inputValue(),'Dayton, NJ');
   assert.equal(await root.getByLabel('Load / order #',{exact:true}).count(),0);
   assert.equal(buildDotOfficerCheck(before,day).issues.filter(i=>i.id==='pickup_route_pickup').length,0);
   for(const width of [320,390,820]){await page.setViewportSize({width,height:1000});assert.equal((await design(page)).overflow,false,'Fits '+width);}
   await page.setViewportSize({width:390,height:844});await fields.scrollIntoViewIfNeeded();
   await page.screenshot({path:output+'/'+name+'-'+(legacy?'legacy':'bol')+'.png'});
   await fields.getByLabel('BOL #',{exact:true}).fill('UNSAVED');await root.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual((await stored(page)).eventsByDay,before.eventsByDay);
   await edit(page,'pickup');await fields.getByLabel('Going to',{exact:true}).fill('Reviewed City, NJ');await root.getByRole('button',{name:'Save changes',exact:true}).click();
   const destinationSaved=await waitState(page,s=>get(s)?.destination==='Reviewed City, NJ');
   for(const key of ['bol','shippingDocs','loadNo','po','startMin','endMin','status','lat','lng','locationSource'])assert.deepEqual(get(destinationSaved)[key],get(before)[key],key+' destination only');
   await page.reload();await edit(page,'pickup');assert.equal(await fields.getByLabel('BOL #',{exact:true}).inputValue(),legacy?'LEGACY-BOL':'00787889');
   await fields.getByLabel('BOL #',{exact:true}).fill('NEW-BOL');await root.getByRole('button',{name:'Save changes',exact:true}).click();
   const saved=await waitState(page,s=>get(s)?.bol==='NEW-BOL');
   assert.equal(get(saved).shippingDocs,'NEW-BOL');
   for(const key of ['loadNo','po','startMin','endMin','status','lat','lng','locationSource'])assert.deepEqual(get(saved)[key],get(before)[key],key+' BOL only');
   assert.deepEqual(saved.signatureByDay,before.signatureByDay);assert.deepEqual(saved.eventsByDay[prior],before.eventsByDay[prior]);assert.deepEqual(saved.manualMilesByDay,before.manualMilesByDay);
   assert.equal(saved.logbookEditHistoryByDay[day].at(-1).beforeEvents.find(e=>e.id==='pickup').bol,get(destinationSaved).bol);
   await page.reload();await edit(page,'pickup');assert.equal(await fields.getByLabel('BOL #',{exact:true}).inputValue(),'NEW-BOL');
   assert.deepEqual(errors,[]);console.log('PASS '+name+' '+(legacy?'legacy':'canonical')+' pickup: two fields, saved BOL recognized, cancel, destination-only edit, BOL edit/reload and protected evidence');
  }catch(error){console.error({name,legacy,error:String(error),errors,body:(await page.locator('body').innerText()).slice(-2500)});throw error;}
  finally{await context.close();}
 }}finally{await browser.close();}
}
