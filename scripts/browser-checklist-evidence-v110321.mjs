import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
import {checklistFixture} from './v110321/checklistFixture.mjs';
import {buildInstructionGuideV110311} from '../source/src/modules/loads/instructionGuideV110311.js';

const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output=`browser-test-results/checklist-evidence-${process.env.TEST_ORIGIN?'production':'local'}`;
fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000029',email:'ratecon-boundary@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const profile={setupComplete:true,mode:'own_authority',companyName:'Example Carrier LLC',carrierName:'Example Carrier LLC',truckNumber:'12',trailerNumber:'TEST',fleetSize:1,modules:['documents','loads','logbook','dot','drive','wallet'],createdAt:'2026-01-01T00:00:00Z',updatedAt:Date.now()};
const fake='live_1788780557647';
function baseState(){return {view:'home',activeDay:'2026-09-07',sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'12',trailer:'TEST',email:user.email},driverProfile:{name:'Synthetic Driver',email:user.email},carrierName:'Example Carrier LLC',mainOfficeAddress:'100 Example Road, Example City, IL 60000',dotNumber:'0000000',currentTrailer:'TEST',currentStatus:'OFF',currentReason:'Off Duty',currentLocation:{city:'Downers Grove',state:'IL'},eventsByDay:{'2026-09-07':[{id:fake,status:'OFF',startMin:0,endMin:985,city:'Downers Grove',state:'IL',source:'manual',note:'Off Duty'}]},certifyStatus:{'2026-09-07':'Active day / Not certified yet'},signatureByDay:{},inspectionByDay:{},formByDay:{},dotWallet:{documents:{}},loadGuidesById:{},activeLoadGuideId:'',routeLegsByDay:{'2026-09-07':[{id:'leg_'+fake,loadGroupId:fake,pickupEventId:fake,fromCity:'Downers Grove',fromState:'IL',toCity:'',toState:'',shippingDocs:'',loadNo:'',kind:'loaded',status:'open',source:'pickup_event'}]},loadInfo:{loadNo:'',shippingDocs:'',pickupCity:'Downers Grove',pickupState:'IL',guideId:'',sourceEventId:fake,sourceEventDay:'2026-09-07',updatedAt:Date.now()}};}
function instructionState(){
 const state=baseState();state.routeLegsByDay={};
 const stops=[{id:'pu',type:'pickup',company:'Example Factory',city:'Howe',state:'IN',cityState:'Howe, IN',address:'100 Example Road, Howe, IN 46746',date:'2026-09-08',appointment:'FCFS 08:00–16:00'},{id:'delivery',type:'delivery',company:'Example Receiver',city:'Smithfield',state:'RI',cityState:'Smithfield, RI',address:'200 Example Avenue, Smithfield, RI 02917',date:'2026-09-10',appointment:'Appt 06:00–07:00',deliverySequence:1},{id:'return',type:'delivery',role:'trailer_return',company:'Example Factory',city:'Howe',state:'IN',cityState:'Howe, IN',address:'100 Example Road, Howe, IN 46746',date:'2026-09-17',appointment:'FCFS 08:00–16:00',deliverySequence:2}];
 const plan={version:1,loadNo:'76543210',broker:'TQL',stops,fields:{pickupDate:'2026-09-08',deliveryDate:'2026-09-17'},risks:[{id:'macropoint',title:'MacroPoint tracking required',detail:'Driver Must Accept MacroPoint'}],sourceText:'Driver instructions'};
 const record={id:'test-instruction-doc',type:'load_tender',status:'verified',canonicalLoadNo:plan.loadNo,broker:plan.broker,documentDate:'2026-09-08',linkDay:'2026-09-08',linkToLogbook:true,createdAt:Date.now(),extracted:{instructionPlanV110311:plan}};
 record.instructionGuide=buildInstructionGuideV110311(plan,record);state.testInstructionStore={loads:[],documents:[record]};return state;
}
async function seed(page,state){
 await page.goto(origin+'/_not-found');
 await page.evaluate(async({schemas,state,session,profile})=>{
  localStorage.setItem('owner-op-road-ready-business-v1',JSON.stringify(state.testInstructionStore));delete state.testInstructionStore;
  localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));
  localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');
  localStorage.setItem('owner-op-road-ready-operator-profile-v1',JSON.stringify(profile));
  await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const[name,schema]of Object.entries(schemas)){const[key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
 },{schemas,state,session,profile});
 await page.goto(origin);
 await page.locator('.logbook-home-screen-v988').waitFor({timeout:30000});
 const adaptiveHome=page.locator('.adaptive-home-v1038');
 if(!(await adaptiveHome.isVisible().catch(()=>false))){
   const homeButton=page.getByRole('button',{name:/Home/i}).first();
   await homeButton.waitFor({timeout:30000});
   await homeButton.click();
 }
 await adaptiveHome.waitFor({timeout:30000});
}
async function setupRoutes(context){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic Rate Con boundary: external access blocked'},headers});});
}
async function snapshot(page){return page.evaluate(async()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readonly'),q=tx.objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{resolve(q.result?.state);db.close();};};}));}
const protectedFields=['eventsByDay','signatureByDay','certifyStatus','inspectionByDay','formByDay'];
const protectedData=state=>Object.fromEntries(protectedFields.map(k=>[k,state[k]]));
const reports=[];
for(const[name,type] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await type.launch({headless:true});
 try {
  for(const scenario of ['existing-load-logs','combined-pti-delivery']) {
   const f=checklistFixture();
   f.guide.steps.find(s=>s.id==='pickup_ready').checklist.push('Trailer damage-free');
   if(scenario==='combined-pti-delivery')delete f.state.eventsByDay['2026-09-08'];
   f.state.eventsByDay['2026-09-10'].push({id:'after-drive-rest',status:'OFF',startMin:620,endMin:1440,city:'Smithfield',state:'RI',reasons:['Off Duty'],source:'manual'});
   const state={...baseState(),...f.state,view:'logbook',activeDay:'2026-09-10',currentStatus:'OFF',currentReason:'Off Duty',currentLocation:{city:'Smithfield',state:'RI'},testInstructionStore:f.store};
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'America/New_York',colorScheme:'light',serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date(f.now));await setupRoutes(context);
   try {
    await seed(page,state);
    await page.locator('.adaptive-home-v1038.active-load').waitFor();
    const before=protectedData(await snapshot(page));
    await page.getByRole('button',{name:'Full mission',exact:true}).click();
    const row=id=>page.locator(`[data-checklist-step="${id}"]`);
    await row('pretrip').waitFor();
    assert.doesNotMatch(await page.locator('body').innerText(),/\[object Object\]/);
    assert.equal(await row('pretrip').getAttribute('data-complete'),'true');
    assert.match(await row('pretrip').innerText(),/Done/);assert.match(await row('pretrip').innerText(),/Logbook/);
    assert.equal(await row('pretrip').getByRole('button').count(),0);
    assert.equal(await row('arrive_delivery_1').getAttribute('data-complete'),'true');
    assert.equal(await row('final_pod').getAttribute('data-complete'),'false');
    if(scenario==='existing-load-logs')assert.equal(await row('depart_pickup').getAttribute('data-complete'),'true');
    assert.deepEqual(protectedData(await snapshot(page)),before,'opening checklist must not change recorded days');
    // A saved signature review must update the open checklist without a reload.
    await page.evaluate(()=>{const key='owner-op-road-ready-business-v1',store=JSON.parse(localStorage.getItem(key));const d=store.documents.find(d=>d.id==='bol-fixture');d.podSigned=true;d.stopSequence=1;localStorage.setItem(key,JSON.stringify(store));window.dispatchEvent(new CustomEvent('owner-op-business-updated'));});
    await page.waitForFunction(()=>document.querySelector('[data-checklist-step="final_pod"]')?.dataset.complete==='true');
    assert.equal(await row('delivery_docs_1').getAttribute('data-complete'),'true');
    assert.equal(await row('pickup_ready').getAttribute('data-complete'),'false');
    // A signature correction must reopen the derived paperwork steps immediately.
    await page.evaluate(()=>{const key='owner-op-road-ready-business-v1',store=JSON.parse(localStorage.getItem(key));store.documents.find(d=>d.id==='bol-fixture').podSigned=false;localStorage.setItem(key,JSON.stringify(store));window.dispatchEvent(new CustomEvent('owner-op-business-updated'));});
    await page.waitForFunction(()=>document.querySelector('[data-checklist-step="final_pod"]')?.dataset.complete==='false');
    assert.deepEqual(protectedData(await snapshot(page)),before);
    await page.screenshot({path:`${output}/${name}-${scenario}.png`,fullPage:true});
    await page.getByRole('button',{name:'Back',exact:true}).click();
    await page.locator('.adaptive-home-v1038.active-load').waitFor();
    await page.reload();await page.locator('.adaptive-home-v1038.active-load').waitFor({timeout:30000});
    await page.getByRole('button',{name:'Full mission',exact:true}).click();await row('pretrip').waitFor();
    assert.equal(await row('pretrip').getAttribute('data-complete'),'true');
    assert.deepEqual(protectedData(await snapshot(page)),before);
    assert.deepEqual(errors,[]);
    reports.push({browser:name,scenario,passed:true});console.log(`PASS — ${name} ${scenario}: PTI / delivery recognized, document edits live, reload, protected logs unchanged`);
   } catch(error) {await page.screenshot({path:`${output}/${name}-${scenario}-FAILED.png`,fullPage:true}).catch(()=>{});reports.push({browser:name,scenario,passed:false,error:String(error),stack:error.stack,pageErrors:errors});fs.writeFileSync(`${output}/${name}-${scenario}-FAILED-state.json`,JSON.stringify({state:await snapshot(page),body:await page.locator('body').innerText()},null,2));console.error(error);} finally {await context.close();}
  }
 } finally {await browser.close();}
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports.filter(r=>!r.passed)));
