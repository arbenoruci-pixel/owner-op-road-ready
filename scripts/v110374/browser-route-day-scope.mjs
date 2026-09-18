// All fixtures are synthetic. External account requests are intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {chromium,webkit} from 'playwright';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const day='2026-09-10',earlier='2026-09-09';
const out='browser-test-results/route-day-scope-v110374';fs.mkdirSync(out,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Chicago',state:'IL',source:'manual',note:'',...extra});
function fixture(guideId){return {view:'day',activeDay:day,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'TEST',trailer:'TEST'},driverProfile:{name:'Synthetic Driver'},carrierName:'Synthetic Carrier',mainOfficeAddress:'Test Office',currentTrailer:'TEST',currentStatus:'OFF',currentLocation:{city:'Chicago',state:'IL'},
 eventsByDay:{[day]:[row('rest','OFF',0,600),row('pickup','ON',600,620,{note:'Hook / Pickup Trailer',shippingDocs:'TEST-NY-123',loadNo:'TEST-NY-123',destination:'New York, NY',hookedTrailer:'TEST'}),row('drive','D',620,900),row('stop','OFF',900,1440)]},
 routeLegsByDay:{[day]:[{id:'local-route',day,pickupDay:day,pickupEventId:'pickup',pickupMin:600,shippingDocs:'TEST-NY-123',loadNo:'TEST-NY-123',fromCity:'Chicago',fromState:'IL',toCity:'New York',toState:'NY',kind:'loaded',status:'open',source:'pickup_event',updatedAt:1}],
 [earlier]:[{id:'other-route',day:earlier,pickupDay:earlier,pickupMin:200,shippingDocs:'TEST-CHAR-123',loadNo:'TEST-CHAR-123',loadGroupId:'other-guide',fromCity:'Example origin',fromState:'GA',toCity:'Charleston',toState:'SC',kind:'loaded',status:'open',source:'route_leg',updatedAt:1}]},
 activeLoadGuideId:guideId,loadInfo:{shippingDocs:'TEST-CHAR-123',loadNo:'TEST-CHAR-123',guideId,deliveryCity:'Charleston',deliveryState:'SC'},loadGuidesById:{'other-guide':{id:'other-guide',loadNo:'TEST-CHAR-123',status:'active'}},certifyStatus:{[day]:'Needs signature'},signatureByDay:{},inspectionByDay:{},manualMilesByDay:{[day]:120},logbookEditHistoryByDay:{},formByDay:{},dotWallet:{documents:{}}};}
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state);};q.onerror=()=>reject(q.error);};}));}
const reports=[];
for(const [browserName,type]of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 for(const guideId of ['other-guide','']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/Chicago',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({status:200,json:{}});return route.continue();}
    const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
    if(route.request().method()==='OPTIONS')return route.fulfill({status:200,body:'',headers});
    if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});
    if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});
    if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});
    return route.fulfill({status:403,json:{error:'External requests disabled for synthetic test'},headers});
   });
   await page.clock.setFixedTime(new Date('2026-09-12T14:00:00Z'));await page.goto(origin+'/_not-found');
   await page.evaluate(async({schemas,state,session})=>{
    localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');
    await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const [name,schema]of Object.entries(schemas)){const [key,...indexes]=schema.split(',').map(x=>x.trim()),store=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');store.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
   },{schemas,state:fixture(guideId),session});
   const form=()=>page.getByRole('navigation',{name:'Log sections'}).getByRole('button',{name:'Form',exact:true});
   const assertView=async()=>{await form().click({timeout:30000});const cards=page.locator('.route-leg-item');await cards.first().waitFor();assert.equal(await cards.count(),1,'only the day-linked route is displayed');assert.match(await cards.innerText(),/New York/);assert.doesNotMatch(await cards.innerText(),/Charleston|TEST-CHAR-123/);};
   await page.goto(origin);await assertView();const before=await stored(page);
   const all=Object.values(before.routeLegsByDay).flat();assert.ok(all.some(r=>r.id==='other-route'&&r.toCity==='Charleston'),'other-day original is preserved');
   assert.equal(before.eventsByDay[day].find(e=>e.id==='pickup').shippingDocs,'TEST-NY-123','original pickup reference is preserved');
   await page.reload();await assertView();const after=await stored(page);
   for(const key of ['eventsByDay','signatureByDay','logbookEditHistoryByDay','manualMilesByDay'])assert.deepEqual(after[key],before[key],key+' unchanged by reopen');
   assert.ok(Object.values(after.routeLegsByDay).flat().some(r=>r.id==='other-route'&&r.toCity==='Charleston'));
   assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/${browserName}-${guideId||'no-guide'}.png`,fullPage:true});
   reports.push({browser:browserName,guideId,passed:true,routeCount:1,otherDayRoutePreserved:true});console.log('PASS — '+browserName+' '+(guideId||'no guide')+': only the proper recorded-day route, reload and unchanged records');
  }catch(error){reports.push({browser:browserName,guideId,passed:false,error:String(error),stack:error.stack,errors});await page.screenshot({path:`${out}/${browserName}-${guideId||'no-guide'}-failed.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${out}/${browserName}-${guideId||'no-guide'}-failure.json`,JSON.stringify({error:String(error),errors,text:await page.locator('body').innerText(),state:await stored(page).catch(()=>null)},null,2));console.error(error);}
  finally{await context.close();}
 }
 await browser.close();
}
fs.writeFileSync(out+'/results.json',JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports));
