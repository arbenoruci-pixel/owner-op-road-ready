import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';

const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output=`browser-test-results/dot-officer-email-${process.env.TEST_ORIGIN?'production':'local'}`;
fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000028',email:'dot-share-fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
const row=(id,startMin,endMin)=>({id,status:'OFF',startMin,endMin,city:'Willowbrook',state:'IL',source:'manual',note:'Off Duty'});
function fixture(){const days=['2026-09-07','2026-09-06','2026-09-05','2026-09-04','2026-09-03','2026-09-02','2026-09-01','2026-08-31'];return {view:'dot',activeDay:'2026-09-07',sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,homeTerminalTimeZone:'America/New_York',driver:{truck:'12',trailer:'TEST',email:user.email},driverProfile:{name:'Synthetic Driver',email:user.email},carrierName:'Narta Express LLC',mainOfficeAddress:'92 201 Lake Drive, Willowbrook, IL 60527',dotNumber:'2513324',currentTrailer:'TEST',currentStatus:'OFF',currentReason:'Off Duty',currentLocation:{city:'Willowbrook',state:'IL'},eventsByDay:Object.fromEntries(days.map((d,i)=>[d,[row('off-'+i,0,1440)]])),certifyStatus:Object.fromEntries(days.map(d=>[d,d==='2026-09-07'?'Active day / Not certified yet':'Certified'])),signatureByDay:Object.fromEntries(days.slice(1).map(d=>[d,{signed:true,signedAt:Date.now(),driverName:'Synthetic Driver'}])),inspectionByDay:{},routeLegsByDay:{},formByDay:{},loadGuidesById:{},dotWallet:{documents:{}}};}

async function setup(page,context,state){
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===origin){
   if(url.pathname.startsWith('/api/')) return route.fulfill({json:{},status:200});
   assert.equal(route.request().method(),'GET','DOT browser fixture cannot write to app origin');
   return route.continue();
  }
  const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
  if(route.request().method()==='OPTIONS') return route.fulfill({body:'',headers});
  if(url.pathname.endsWith('/rpc/owner_op_access_v1')) return route.fulfill({json:{approved:true},headers});
  if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1')) return route.fulfill({body:'null',contentType:'application/json',headers});
  if(url.pathname==='/auth/v1/user') return route.fulfill({json:user,headers});
  if(url.pathname.endsWith('/functions/v1/owner-op-cloud-v1')) return route.fulfill({json:{ok:true,result:{}},headers});
  return route.fulfill({status:403,json:{error:'Synthetic DOT email test: external access blocked'},headers});
 });
 await page.clock.setFixedTime(new Date('2026-09-07T19:30:00Z'));
 await page.goto(origin+'/_not-found');
 await page.evaluate(async({schemas,state,session})=>{
  localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));
  localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');
  localStorage.setItem('owner-op-road-ready-last-device-safety-export-v1',JSON.stringify({createdAt:Date.now(),filename:'fixture.tar.gz',sha256:'a'.repeat(64),bytes:100}));
  await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const[name,schema]of Object.entries(schemas)){const[key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
 },{schemas,state,session});
 await page.goto(origin);
 await page.getByRole('heading',{name:'Roadside package',exact:true}).waitFor({timeout:30000});
}

const reports=[];
for(const[name,type]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'America/Los_Angeles',colorScheme:'light',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await setup(page,context,fixture());
  assert.equal(await page.getByPlaceholder('Routing / reference code (if provided)').count(),0);
  await page.getByRole('button',{name:'Begin Inspection',exact:true}).click();
  const input=page.getByLabel('Officer email in officer view',{exact:true});await input.waitFor();
  const button=page.getByRole('button',{name:'Email logs',exact:true});
  assert.equal(await button.isDisabled(),true);
  await input.fill('bad');assert.equal(await button.isDisabled(),true);
  await input.fill('officer@example.gov');assert.equal(await button.isDisabled(),false);
  const geometry=await page.locator('.dot-officer-email-v11028').evaluate(root=>{const r=root.getBoundingClientRect(),input=root.querySelector('input'),button=root.querySelector('button');const ri=input.getBoundingClientRect(),rb=button.getBoundingClientRect();return{root:{x:r.x,right:r.right,width:r.width},input:{x:ri.x,right:ri.right,height:ri.height},button:{x:rb.x,right:rb.right,height:rb.height},vw:innerWidth};});
  assert.ok(geometry.root.x>=0&&geometry.root.right<=geometry.vw+1);assert.ok(geometry.input.x>=0&&geometry.input.right<=geometry.vw+1);assert.ok(geometry.button.right<=geometry.vw+1);assert.ok(geometry.input.height>=44&&geometry.button.height>=44);
  await page.screenshot({path:`${output}/${name}-officer-email-390.png`,fullPage:false});
  await page.setViewportSize({width:320,height:740});await page.waitForTimeout(100);const overflow=await page.locator('.dot-officer-email-v11028').evaluate(root=>root.scrollWidth>root.clientWidth+1);assert.equal(overflow,false);await page.screenshot({path:`${output}/${name}-officer-email-320.png`,fullPage:false});
  assert.deepEqual(errors,[]);reports.push({browser:name,passed:true,origin,pageErrors:errors});console.log(`PASS — ${name}: officer email field is clear, validated, 44px and phone-safe`);
 }catch(error){await page.screenshot({path:`${output}/${name}-FAILED.png`,fullPage:false}).catch(()=>{});reports.push({browser:name,passed:false,error:String(error),stack:error.stack,pageErrors:errors});console.error(error);}
 finally{await context.close();await browser.close();}
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports.filter(r=>!r.passed)));
