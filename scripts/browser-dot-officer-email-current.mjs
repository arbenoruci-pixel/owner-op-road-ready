// Current locked three-step wizard contract; legacy email suite is preserved separately.
import {fixture as signedFixture,at} from './inspection-signed/fixture.mjs';
import {captureInspection,assertInspectionComplete} from '../lib/owner-op-cloud/inspectionSnapshot.js';
import {fixtureCorsHeaders,fulfillLocalAccountSettings,installLocalAccountSettings} from './test-support/cloud-fixture.mjs';
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
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated',session_id:'synthetic-officer-session'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
function fixture(){
 const state=signedFixture();
 // Seed today's unsigned rows in the same explicit shape the app hydrates.
 // Keep historical records/signatures untouched and retain exact packet checks.
 state.eventsByDay[state.activeDay]=state.eventsByDay[state.activeDay].map(event=>({note:'',description:'',reasons:[],...event}));
 return {...state,view:'dot',sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,routeLegsByDay:{},loadGuidesById:{},inspectionByDay:{},dotWallet:{documents:{}}};
}
let packets=[],actions=[],liveBefore;

async function setup(page,context,state){
 await installLocalAccountSettings(context,user);
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===origin){
   if(url.pathname.startsWith('/api/')) return route.fulfill({json:{error:'Synthetic inspection: all application APIs blocked'},status:403});
   assert.equal(route.request().method(),'GET','DOT browser fixture cannot write to app origin');
   return route.continue();
  }
  if(await fulfillLocalAccountSettings(route,origin,user))return;const headers=await fixtureCorsHeaders(route.request(),origin);
  if(route.request().method()==='OPTIONS') return route.fulfill({body:'',headers});
  if(url.origin!=='https://ghwkcgczuwctzxsxmqzx.supabase.co')return route.fulfill({status:403,json:{error:'Synthetic inspection: unknown destination blocked'},headers});
  if(url.pathname.endsWith('/rpc/owner_op_access_v1')) return route.fulfill({json:{approved:true},headers});
  if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1')) return route.fulfill({body:'null',contentType:'application/json',headers});
  if(url.pathname==='/auth/v1/user') return route.fulfill({json:user,headers});
  if(url.origin==='https://ghwkcgczuwctzxsxmqzx.supabase.co'&&url.pathname==='/rest/v1/road_ready_account_workspaces'&&route.request().method()==='GET'&&url.searchParams.get('user_id')==='eq.'+user.id&&url.searchParams.get('select')==='revision')return route.fulfill({json:[{revision:7}],headers});
  if(url.origin==='https://ghwkcgczuwctzxsxmqzx.supabase.co'&&url.pathname==='/functions/v1/owner-op-cloud-v1'){
   const body=route.request().postDataJSON();actions.push(body.action);
   if(body.action==='catalog')return route.fulfill({json:{ok:true,result:{days:[],wallet:[]}},headers});
   if(body.action==='create_snapshot_share'){
    assertInspectionComplete(body.inspection);assert.equal(body.inspection.snapshots.length,8);assert.deepEqual(body.wallet_keys,[]);
    const expected=captureInspection(state,at);assert.deepEqual(body.inspection,captureInspection(liveBefore,at),'all eight snapshots, original signature evidence, cutoff and metadata match the synthetic phone');
    for(const snapshot of body.inspection.snapshots){const original=expected.snapshots.find(row=>row.sourceDay===snapshot.sourceDay);assert.deepEqual(snapshot.dayData.signature,original.dayData.signature);assert.deepEqual(snapshot.inspectionView,original.inspectionView);}
    assert.deepEqual(body.inspection.profile,expected.profile);packets.push(body);
    return route.fulfill({json:{ok:true,result:{id:'synthetic-share',token:'synthetic-officer-token',log_count:8,document_count:0,captured_at:body.inspection.capturedAt,expires_at:new Date(+at+3600000).toISOString()}},headers});
   }
   if(body.action==='inspect'){assert.equal(body.token,'synthetic-officer-token');return route.fulfill({json:{ok:true,result:{items:[]}},headers});}
   return route.fulfill({status:403,json:{error:'Synthetic inspection: unexpected action blocked'},headers});
  }
  return route.fulfill({status:403,json:{error:'Synthetic DOT email test: external access blocked'},headers});
 });
 await page.clock.setFixedTime(at);
 await page.goto(origin+'/_not-found');
 await page.evaluate(async({schemas,state,session})=>{
  localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));
  localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');
  localStorage.setItem('owner-op-road-ready-last-device-safety-export-v1',JSON.stringify({createdAt:Date.now(),filename:'fixture.tar.gz',sha256:'a'.repeat(64),bytes:100}));
  await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const[name,schema]of Object.entries(schemas)){const[key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
 },{schemas,state,session});
 await page.goto(origin);
 await page.getByRole('heading',{name:'Review',exact:true}).waitFor({timeout:30000});
}

const reports=[];
for(const[name,type]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'America/Los_Angeles',colorScheme:'light',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  packets=[];actions=[];const initial=fixture();await setup(page,context,initial);
  assert.equal(await page.getByPlaceholder('Routing / reference code (if provided)').count(),0);
  await page.waitForFunction(()=>typeof window.__rrAccountState==='function');
  liveBefore=await page.evaluate(()=>window.__rrAccountState());
  const before=await page.evaluate(()=>{const s=window.__rrAccountState();return {events:s.eventsByDay,signatures:s.signatureByDay,certify:s.certifyStatus};});
  await page.getByLabel('I reviewed the driver, equipment, logs and Digital Wallet documents.',{exact:true}).check();
  await page.getByRole('button',{name:'Prepare inspection link',exact:true}).click();
  await page.getByRole('link',{name:'Open officer package',exact:true}).waitFor();
  assert.equal(packets.length,1);assert.ok(actions.includes('inspect'),'published mock manifest verified before acknowledgement');
  assert.equal(await page.getByRole('button',{name:'Continue to email',exact:true}).isDisabled(),true);
  await page.getByLabel('I opened the package and checked the logs and Digital Wallet documents.',{exact:true}).check();
  await page.getByRole('button',{name:'Continue to email',exact:true}).click();
  const input=page.getByLabel('Officer email',{exact:true});await input.waitFor();
  const invalid=page.getByRole('button',{name:'Enter a valid officer email',exact:true});
  assert.equal(await invalid.isDisabled(),true);
  await input.fill('bad');assert.equal(await invalid.isDisabled(),true);
  await input.fill('officer@example.test');const button=page.getByRole('link',{name:'Open email to officer',exact:true});
  assert.equal(await button.isEnabled(),true);const mailto=await button.getAttribute('href');
  assert.ok(mailto.startsWith('mailto:officer%40example.test?'));assert.ok(decodeURIComponent(mailto).includes('synthetic-officer-token'));
  // Deliberately inspect only: never open mailto or send anything.
  const geometry=await page.locator('.inspection-wizard').evaluate(root=>{const r=root.getBoundingClientRect(),input=root.querySelector('input[type=email]'),button=root.querySelector('a.inspection-primary');const ri=input.getBoundingClientRect(),rb=button.getBoundingClientRect();return{root:{x:r.x,right:r.right,width:r.width},input:{x:ri.x,right:ri.right,height:ri.height},button:{x:rb.x,right:rb.right,height:rb.height},vw:innerWidth};});
  assert.ok(geometry.root.x>=0&&geometry.root.right<=geometry.vw+1);assert.ok(geometry.input.x>=0&&geometry.input.right<=geometry.vw+1);assert.ok(geometry.button.right<=geometry.vw+1);assert.ok(geometry.input.height>=44&&geometry.button.height>=44);
  await page.screenshot({path:`${output}/${name}-officer-email-390.png`,fullPage:false});
  await page.setViewportSize({width:320,height:740});await page.waitForTimeout(100);const overflow=await page.locator('.inspection-wizard').evaluate(root=>root.scrollWidth>root.clientWidth+1);assert.equal(overflow,false);await page.screenshot({path:`${output}/${name}-officer-email-320.png`,fullPage:false});
  const after=await page.evaluate(()=>{const s=window.__rrAccountState();return {events:s.eventsByDay,signatures:s.signatureByDay,certify:s.certifyStatus};});assert.deepEqual(after,before,'inspection preparation never changes recorded or signed data');assert.equal(packets.length,1);assert.ok(actions.every(a=>['catalog','create_snapshot_share','inspect'].includes(a)),'no send or record mutation API');
  assert.deepEqual(errors,[]);reports.push({browser:name,passed:true,origin,pageErrors:errors});console.log(`PASS — ${name}: officer email field is clear, validated, 44px and phone-safe`);
 }catch(error){await page.screenshot({path:`${output}/${name}-FAILED.png`,fullPage:false}).catch(()=>{});reports.push({browser:name,passed:false,error:String(error),stack:error.stack,pageErrors:errors,actions,packets:packets.length,body:await page.locator('body').innerText().catch(()=>'' )});console.error(error);}
 finally{await context.close();await browser.close();}
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(r=>r.passed),JSON.stringify(reports.filter(r=>!r.passed)));
