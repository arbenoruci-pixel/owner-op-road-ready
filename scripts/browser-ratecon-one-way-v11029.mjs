import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
import { buildDriverLoadGuideV103 } from '../source/src/modules/loads/loadGuideV103.js';

const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output=`browser-test-results/ratecon-one-way-${process.env.TEST_ORIGIN?'production':'local'}`;
fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000029',email:'ratecon-boundary@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const profile={setupComplete:true,mode:'own_authority',companyName:'Narta Express LLC',carrierName:'Narta Express LLC',truckNumber:'12',trailerNumber:'TEST',fleetSize:1,modules:['documents','loads','logbook','dot','drive','wallet'],createdAt:'2026-01-01T00:00:00Z',updatedAt:Date.now()};
const fake='live_1788780557647';
function baseState(){return {view:'home',activeDay:'2026-09-07',sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'12',trailer:'TEST',email:user.email},driverProfile:{name:'Synthetic Driver',email:user.email},carrierName:'Narta Express LLC',mainOfficeAddress:'92 201 Lake Drive, Willowbrook, IL 60527',dotNumber:'2513324',currentTrailer:'TEST',currentStatus:'OFF',currentReason:'Off Duty',currentLocation:{city:'Downers Grove',state:'IL'},eventsByDay:{'2026-09-07':[{id:fake,status:'OFF',startMin:0,endMin:985,city:'Downers Grove',state:'IL',source:'manual',note:'Off Duty'}]},certifyStatus:{'2026-09-07':'Active day / Not certified yet'},signatureByDay:{},inspectionByDay:{},formByDay:{},dotWallet:{documents:{}},loadGuidesById:{},activeLoadGuideId:'',routeLegsByDay:{'2026-09-07':[{id:'leg_'+fake,loadGroupId:fake,pickupEventId:fake,fromCity:'Downers Grove',fromState:'IL',toCity:'',toState:'',shippingDocs:'',loadNo:'',kind:'loaded',status:'open',source:'pickup_event'}]},loadInfo:{loadNo:'',shippingDocs:'',pickupCity:'Downers Grove',pickupState:'IL',guideId:'',sourceEventId:fake,sourceEventDay:'2026-09-07',updatedAt:Date.now()}};}
function rateConState(){
 const state=baseState();
 const guide=buildDriverLoadGuideV103({loadNo:'97155',orderNo:'97155',broker:'Red Lightning Logistics, LLC',carrierName:'NARTA EXPRESS LLC',mcNumber:'871792',equipment:'Power Only',trackingProvider:'FourKites',origin:'Elgin, IL',destination:'Woodhaven, MI',pickupDate:'2026-09-07',deliveryDate:'2026-09-08',total:2700,stops:[{id:'pu',type:'pickup',sequence:0,company:'Pickup',city:'Elgin',state:'IL',cityState:'Elgin, IL',date:'2026-09-07',time:'13:00'},{id:'d1',type:'delivery',sequence:1,deliverySequence:1,company:'Delivery',city:'Woodhaven',state:'MI',cityState:'Woodhaven, MI',date:'2026-09-08',time:'07:00'}]},{documentId:'doc-rate-97155',sourceText:'Carrier Rate Confirmation. Flat rate $2700. FourKites tracking required.'});
 state.loadGuidesById={[guide.id]:guide};state.activeLoadGuideId=guide.id;state.loadInfo={guideId:guide.id,loadNo:'97155',shippingDocs:'97155',source:'rate_confirmation_guide_v103'};state.routeLegsByDay={};return state;
}
async function seed(page,state){
 await page.goto(origin+'/_not-found');
 await page.evaluate(async({schemas,state,session,profile})=>{
  localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));
  localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');
  localStorage.setItem('owner-op-road-ready-operator-profile-v1',JSON.stringify(profile));
  await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const[name,schema]of Object.entries(schemas)){const[key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
 },{schemas,state,session,profile});
 await page.goto(origin);
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
const reports=[];
for(const[name,type]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 try{
  for(const [kind,state,expectedActive] of [['fake-log-route',baseState(),false],['ratecon-guide',rateConState(),true]]){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'America/Chicago',colorScheme:'light',serviceWorkers:'block'});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-09-07T21:21:00Z'));await setupRoutes(context);
   try{await seed(page,state);const body=await page.locator('body').innerText();assert.doesNotMatch(body,/live_1788780557647/i,'operational event ID leaked into Home load identity');if(expectedActive){await page.locator('.adaptive-home-v1038.active-load').waitFor();await page.locator('.adaptive-mission-v1038').waitFor();assert.match(await page.locator('.adaptive-mission-v1038').innerText(),/97155/);assert.equal(await page.locator('.adaptive-home-v1038.no-load').count(),0);}else{await page.locator('.adaptive-home-v1038.no-load').waitFor();assert.equal(await page.locator('.adaptive-mission-v1038').count(),0);assert.match(await page.locator('.adaptive-no-load-v1038').innerText(),/Ready for the next Rate Con/);}assert.deepEqual(errors,[]);await page.screenshot({path:`${output}/${name}-${kind}.png`,fullPage:false});reports.push({browser:name,kind,passed:true});console.log(`PASS — ${name} ${kind}: ${expectedActive?'Rate Con guide owns Active Load':'log/route fallback stays inactive'}`);}catch(error){await page.screenshot({path:`${output}/${name}-${kind}-FAILED.png`,fullPage:false}).catch(()=>{});reports.push({browser:name,kind,passed:false,error:String(error),stack:error.stack,pageErrors:errors});console.error(error);}finally{await context.close();}
  }
 }finally{await browser.close();}
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports.filter(r=>!r.passed)));
