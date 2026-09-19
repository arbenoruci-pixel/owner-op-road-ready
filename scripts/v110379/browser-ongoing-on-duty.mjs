import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {chromium,webkit} from 'playwright';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output='browser-test-results/ongoing-on-duty-v110379';fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000078',email:'duty-fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const day='2026-09-19',prior='2026-09-18';
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
 await page.clock.setFixedTime(new Date('2026-09-19T14:57:00Z'));await page.goto(origin+'/_not-found');
 await page.evaluate(async({schemas,state,session})=>{localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const[name,schema]of Object.entries(schemas)){const[key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{schemas,state,session});
 await page.goto(origin);await page.locator('[data-log-event-id=drop]').waitFor({timeout:30000});
}
function handoffFixture(recorded=false){const state=fixture();state.currentStatus='ON';state.currentReason='Pre-trip inspection · Drop Off';state.currentLocation={city:'Onalaska',state:'WI'};state.currentTrailer='No trailer';state.equipment={type:'dry_van',trailer:''};state.driver.trailer='';state.routeLegsByDay={};state.eventsByDay[day]=[row('rest','SB',0,646),row('drop','ON',646,647,{source:'live_status',note:'Pre-trip inspection · Drop Off',reasons:['Pre-trip inspection','Drop Off'],droppedTrailer:'511865',hookedTrailer:'',lat:43.8,lng:-91.2,gpsAccuracy:8,locationSource:'gps',...(recorded?{shippingDocs:'LOAD-A',loadNo:'LOAD-A',bol:'BOL-B',destination:'Milwaukee, WI',loadDetailsExplicit:true}:{})})];return state;}
const reports=[];
for(const[name,type]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 try{for(const scenario of ['handoff','recorded','blank-pickup']){
  const recorded=scenario==='recorded', blankPickup=scenario==='blank-pickup';
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/Chicago',serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  try{
   await setup(page,context,handoffFixture(recorded));const before=await stored(page),previous=before.eventsByDay[day].find(e=>e.id==='drop');
   const root=page.locator('.dd-root[data-duty-mode=current]');
   await page.getByRole('button',{name:'Status',exact:true}).click();await root.waitFor();
   if(blankPickup){
    await root.getByRole('button',{name:'Pickup / Loading',exact:true}).click();
    assert.equal(await root.getByRole('button',{name:'Drop Off',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await root.getByText(/Updates current ON Duty/).count(),0);
   }else if(!recorded){
    assert.equal(await root.getByRole('button',{name:'Drop Off',exact:true}).getAttribute('aria-pressed'),'true');
    await root.getByRole('button',{name:'Drop & Hook',exact:true}).click();
    assert.equal(await root.getByRole('button',{name:'Drop Off',exact:true}).getAttribute('aria-pressed'),'false');
    assert.equal(await root.getByRole('button',{name:'Pre-trip inspection',exact:true}).getAttribute('aria-pressed'),'true');
    await root.getByText(/Updates current ON Duty from 10:46/).waitFor();
    await root.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual((await stored(page)).eventsByDay,before.eventsByDay);
    await page.getByRole('button',{name:'Status',exact:true}).click();await root.getByRole('button',{name:'Drop & Hook',exact:true}).click();
   }else{
    await root.getByRole('button',{name:'Fuel',exact:true}).click();assert.equal(await root.getByText(/Updates current ON Duty/).count(),0);
   }
   await root.getByRole('button',{name:/^Save/ }).click();
   const saved=await waitState(page,s=>(recorded||blankPickup)?s.eventsByDay[day].length===3:s.logbookEditHistoryByDay?.[day]?.some(e=>e.source==='ongoing_on_duty_handoff'));
   const current=saved.eventsByDay[day].find(e=>e.id==='drop');assert.equal(current.startMin,646);
   assert.deepEqual(saved.eventsByDay[prior],before.eventsByDay[prior]);assert.deepEqual(saved.manualMilesByDay,before.manualMilesByDay);assert.deepEqual(saved.signatureByDay,before.signatureByDay);
   if(blankPickup){const added=saved.eventsByDay[day].find(e=>e.id!=='drop'&&e.status==='ON');assert.ok(added);assert.equal(added.startMin,657);assert.equal(added.loadDetailsExplicit,true);assert.ok(added.reasons.includes('Pickup / Loading'));assert.equal(added.loadNo,'');assert.equal(added.destination,'');assert.equal(current.note,previous.note);assert.deepEqual(current.reasons,previous.reasons);assert.equal(saved.logbookEditHistoryByDay?.[day]?.some(e=>e.source==='ongoing_on_duty_handoff')||false,false);}
   else if(!recorded){assert.equal(saved.eventsByDay[day].length,2);assert.deepEqual([...current.reasons].sort(),['Drop & Hook','Pre-trip inspection']);assert.ok(!current.note.includes('Drop Off'));assert.equal(current.endMin,658);assert.equal(current.droppedTrailer,'511865');assert.equal(current.lat,43.8);assert.equal(current.lng,-91.2);const entry=saved.logbookEditHistoryByDay[day].find(e=>e.source==='ongoing_on_duty_handoff');assert.deepEqual(entry.beforeEvents,before.eventsByDay[day]);assert.deepEqual(entry.afterEvents,saved.eventsByDay[day]);assert.equal(saved.inspectionByDay[day].sourceEventId,'drop');}
   else for(const key of ['loadNo','bol','shippingDocs','destination','lat','lng','reasons','note'])assert.deepEqual(current[key],previous[key],key);
   await page.reload();await page.locator('[data-log-event-id=drop]').waitFor();const reopened=await stored(page);if(blankPickup){assert.equal(reopened.eventsByDay[day].length,3);for(const row of saved.eventsByDay[day]){const reopenedRow=reopened.eventsByDay[day].find(e=>e.id===row.id);for(const field of ['startMin','endMin','reasons','loadNo','destination','loadDetailsExplicit'])assert.deepEqual(reopenedRow[field],row[field],field);}}else assert.deepEqual(reopened.eventsByDay[day],saved.eventsByDay[day]);assert.equal(await page.locator('[data-log-event-id=drop]').count(),1);
   await page.screenshot({path:`${output}/${name}-${scenario}.png`});assert.deepEqual(errors,[]);reports.push({browser:name,scenario,passed:true});
  }catch(error){await page.screenshot({path:`${output}/${name}-FAILED.png`}).catch(()=>{});fs.writeFileSync(`${output}/${name}-failure.json`,JSON.stringify({error:String(error),stack:error.stack,state:await stored(page).catch(()=>null),errors},null,2));reports.push({browser:name,scenario,passed:false,error:String(error)});console.error(error);}finally{await context.close();}
 }}finally{await browser.close();}
}
fs.writeFileSync(output+'/results.json',JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports));console.log('PASS — Chromium/WebKit Save, Cancel, reload, PTI, GPS and protected pickup remain correct');
