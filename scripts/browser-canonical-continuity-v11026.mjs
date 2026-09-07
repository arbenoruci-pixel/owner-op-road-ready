import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output=`browser-test-results/canonical-continuity-${process.env.TEST_ORIGIN?'production':'local'}`;fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000026',email:'continuity-fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Willowbrook',state:'IL',source:'manual',note:status==='OFF'?'Off Duty':status==='SB'?'Sleeper':status==='ON'?'On Duty':'Driving',...extra});
const sep6=[row('off-a','OFF',0,998),row('off-b','OFF',998,1033),row('off-c','OFF',1033,1364)];
function fixture(activeDay){return {view:'day',activeDay,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'TEST',trailer:'TEST'},driverProfile:{name:'Synthetic Driver'},carrierName:'Synthetic Carrier',mainOfficeAddress:'Test Office',currentTrailer:'TEST',currentStatus:'OFF',currentReason:'Off Duty',currentLocation:{city:'Willowbrook',state:'IL'},eventsByDay:{'2026-08-20':[row('anchor','OFF',1200,1440)],'2026-09-06':sep6},certifyStatus:{'2026-09-06':'Needs signature'},signatureByDay:{},inspectionByDay:{},routeLegsByDay:{},formByDay:{},loadGuidesById:{},dotWallet:{documents:{}}};}
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state);};q.onerror=()=>reject(q.error);};}));}
async function setup(page,context,state){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});assert.equal(route.request().method(),'GET','continuity browser fixture cannot send app writes');return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic continuity test: external access blocked'},headers});});
 await page.clock.setFixedTime(new Date('2026-09-07T10:23:00Z'));
 await page.goto(origin+'/_not-found');
 await page.evaluate(async({schemas,state,session})=>{localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const[name,schema]of Object.entries(schemas)){const[key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{schemas,state,session});
 await page.goto(origin);await page.locator('.logbook-ui-v110 .log-graph-v110').waitFor({timeout:30000});
}
const reports=[];
for(const[name,type]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 for(const activeDay of ['2026-09-06','2026-09-05','2026-09-07']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'America/Los_Angeles',colorScheme:'light',serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await setup(page,context,fixture(activeDay));const rows=page.locator('.events.clean-events .clean-event-row');await rows.first().waitFor();assert.equal(await rows.count(),1,'one canonical event row expected');assert.equal(await page.getByText('No events yet',{exact:true}).count(),0);
   if(activeDay==='2026-09-06'){
    assert.equal(await rows.first().locator('.event-badge').innerText(),'OFF');assert.match(await rows.first().innerText(),/OFF DUTY/);assert.equal(await rows.first().locator('button.blue-edit').count(),1,'canonical real row stays editable');assert.equal(await rows.first().locator('.event-continuity-tag-v11026').count(),0);
   }else{
    assert.equal(await rows.first().locator('.event-badge').innerText(),'OFF');assert.match(await rows.first().innerText(),/OFF DUTY/);assert.equal(await rows.first().locator('button.blue-edit').count(),0,'derived carry row must not be editable');assert.equal(await rows.first().locator('.event-continuity-tag-v11026').innerText(),activeDay==='2026-09-07'?'Now':'Sign');const snapshot=await stored(page);assert.equal((snapshot.eventsByDay?.[activeDay]||[]).length,0,'rendering carry must not write a raw event');
   }
   await page.screenshot({path:`${output}/${name}-${activeDay}.png`,fullPage:false});assert.deepEqual(errors,[]);reports.push({browser:name,activeDay,passed:true,origin,pageErrors:errors});console.log(`PASS — ${name} ${activeDay}: one canonical status body; carry stays read-only`);
  }catch(error){await page.screenshot({path:`${output}/${name}-${activeDay}-FAILED.png`,fullPage:false}).catch(()=>{});reports.push({browser:name,activeDay,passed:false,error:String(error),stack:error.stack,pageErrors:errors});console.error(error);}
  finally{await context.close();}
 }
 await browser.close();
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports.filter(r=>!r.passed)));
