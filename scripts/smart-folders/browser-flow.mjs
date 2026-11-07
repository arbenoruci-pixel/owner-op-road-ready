// Isolated synthetic local fixture only. Never connects to an account or production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {fixtureCloudOrigin,fixtureCorsHeaders} from '../test-support/cloud-fixture.mjs';
import {baseState,seed,setupRoutes,simplePdf,snapshot,protectedData as protectedBaseData,origin} from '../v110434/browserFixture.mjs';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname),'Synthetic browser tests require a loopback TEST_ORIGIN');
const syntheticUserId='00000000-0000-4000-8000-000000000029';
const out='browser-test-results/smart-folders';fs.mkdirSync(out,{recursive:true});
const savedInputs=new Map();
const protectedData=state=>({...protectedBaseData(state),...Object.fromEntries(['routeLegsByDay','teamLogbooksByDriverId','teamDrivers','activeDriverId','loadGuidesById','activeLoadGuideId','loadInfo'].map(key=>[key,state[key]]))});
const original=simplePdf('SYNTHETIC RATE CONFIRMATION\nLoad 82002\nOriginal bytes must remain unchanged');
async function stored(page){return page.evaluate(async()=>new Promise((resolve,reject)=>{const q=indexedDB.open('owner-op-road-ready-offline-v1');q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result,tables=['documents_local','document_blobs','capture_asset_blobs'],tx=db.transaction(tables),result={business:JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')||'{}')};for(const table of tables){const r=tx.objectStore(table).getAll();r.onsuccess=()=>result[table]=r.result;}tx.oncomplete=async()=>{try{for(const table of ['document_blobs','capture_asset_blobs'])result[table]=await Promise.all(result[table].map(async r=>({...r,blob:undefined,file:undefined,bytes:r.blob||r.file?Array.from(new Uint8Array(await window.__rrFixtureBlob(r.blob||r.file).arrayBuffer())):null})));resolve(result);}catch(e){reject(e);}finally{db.close();}};};}));}
async function folders(page){await page.getByRole('button',{name:/^Documents/}).first().click();await page.getByRole('region',{name:'Smart load folders',exact:true}).waitFor();}
async function fit(page){assert.ok(await page.locator('.rr-smart').evaluate(e=>e.getBoundingClientRect().right<=innerWidth+1&&e.scrollWidth<=e.clientWidth+1),'folder fits mobile viewport');}
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.TEST_BROWSER||process.env.TEST_BROWSER===name)){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rr-smart-folders-'));
 const context=await engine.launchPersistentContext(profile,{headless:true,...(name==='chromium'&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),viewport:{width:390,height:844},serviceWorkers:'block'});
 await setupRoutes(context);
 // Register after setupRoutes: Playwright evaluates the newest matching route
 // first. All account/original requests are fulfilled here, never forwarded.
 const originalRequests={workspace:0,legacy:0};
 await context.route('**/rest/v1/road_ready_account_workspaces?**',async route=>{
  const request=route.request(),url=new URL(request.url()),headers=await fixtureCorsHeaders(request,origin);
  if(request.method()==='OPTIONS')return route.fulfill({status:204,body:'',headers});
  const authorization=(await request.allHeaders()).authorization||'';
  let owner='';try{owner=JSON.parse(Buffer.from(authorization.replace(/^Bearer /i,'').split('.')[1],'base64url')).sub;}catch{}
  const allowed=url.origin===fixtureCloudOrigin&&request.method()==='GET'&&url.searchParams.get('user_id')===`eq.${syntheticUserId}`&&url.searchParams.get('select')==='user_id,payload'&&owner===syntheticUserId&&authorization.endsWith('.synthetic');
  if(!allowed)return route.fulfill({status:403,json:{error:'Synthetic fixture blocks foreign owners and account writes'},headers});
  originalRequests.workspace++;
  // maybeSingle accepts zero rows as a null workspace. No account original exists.
  return route.fulfill({status:200,json:[],headers});
 });
 await context.route('**/api/documents/read-original',async route=>{
  const request=route.request(),url=new URL(request.url());let body;try{body=request.postDataJSON();}catch{}
  if(url.origin!==origin||request.method()!=='POST'||body?.client_document_id!=='missing-client')return route.fulfill({status:403,json:{error:'Synthetic fixture blocks unrecognized original requests'}});
  originalRequests.legacy++;return route.fulfill({status:404,json:{error:'Synthetic original not found'}});
 });
 const page=await context.newPage();page.setDefaultTimeout(45000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  const state=baseState();state.eventsByDay['2026-09-07'][0].loadNo='82002';state.signatureByDay={'2026-09-06':{name:'Synthetic signed day',data:'do-not-change'}};
  state.teamLogbooksByDriverId={synthetic_secondary:{eventsByDay:{'2026-09-06':[{id:'synthetic-secondary-off',status:'OFF',startMin:0,endMin:1440,source:'manual',note:'Secondary driver protected day'}]},signatureByDay:{'2026-09-06':{name:'Synthetic second driver',data:'unchanged-secondary-signature'}},certifyStatus:{'2026-09-06':'Certified'},formByDay:{'2026-09-06':{shippingDocs:'82002'}},inspectionByDay:{},routeLegsByDay:{}}};
  state.testInstructionStore={loads:[{id:'active',loadNo:'82002',status:'booked',origin:'Albany, NY',destination:'Madison, WI',broker:'Example Active Broker'},{id:'done',loadNo:'82003',status:'delivered',origin:'Chicago, IL',destination:'Cleveland, OH',broker:'Example Finished Broker'}],documents:[{id:'existing-local',localDocumentId:'existing-local',clientDocumentId:'existing-client',loadNo:'82002',type:'rate_confirmation',title:'Original ratecon',original_file_name:'existing.pdf',sha256:createHash('sha256').update(original).digest('hex')},{id:'missing-local',clientDocumentId:'missing-client',loadNo:'82003',type:'pod',title:'Missing POD original',sync_state:'pending'}],fuel:[],expenses:[],maintenance:[],settlements:[]};
  await seed(page,state,[{id:'existing',bytes:[...original]}]);const protectedBefore=protectedData(await snapshot(page));const before=await stored(page);
  await folders(page);let root=page.getByRole('region',{name:'Smart load folders',exact:true});
  await root.locator('.rr-smart-card').filter({hasText:'Load 82002'}).waitFor();assert.equal(await root.locator('.rr-smart-card').filter({hasText:'Load 82003'}).count(),0);
  await root.getByRole('button',{name:/^Completed/}).click();await root.locator('.rr-smart-card').filter({hasText:'Load 82003'}).waitFor();
  await root.getByRole('button',{name:/^Active/}).click();await root.getByRole('searchbox').fill('Cleveland');await root.locator('.rr-smart-card').filter({hasText:'Load 82003'}).click();
  await root.getByRole('region',{name:'POD',exact:true}).getByRole('button').click();await root.getByRole('alert').waitFor();assert.match(await root.getByRole('alert').innerText(),/original has not synced|original is unavailable/i);assert.doesNotMatch(await root.getByRole('alert').innerText(),/sign in/i);
  assert.ok(originalRequests.workspace>0,'missing original uses the synthetic owner-scoped workspace lookup');
  await root.getByRole('button',{name:'‹ All load folders',exact:true}).click();await root.getByRole('searchbox').fill('82002');await root.locator('.rr-smart-card').filter({hasText:'Load 82002'}).click();await fit(page);
  await root.getByRole('button',{name:'Share documents',exact:true}).click();const link=root.getByRole('link',{name:/^Save /}).first();await link.waitFor();assert.deepEqual(await link.evaluate(async a=>Array.from(new Uint8Array(await(await fetch(a.href)).arrayBuffer()))),[...original],'existing original opens with exact bytes');
  await page.screenshot({path:`${out}/${name}-folder.png`,fullPage:true});
  for(const kind of ['pod','fuel_receipt']){
   if(kind==='pod')await root.getByRole('region',{name:'POD',exact:true}).getByRole('button').click();else await root.getByRole('button',{name:'+ Add fuel receipt',exact:true}).click();
   const text=kind==='pod'?'PROOF OF DELIVERY\nLoad 82002\nDELIVERED 09/07/2026\nReceiver: Example Receiver\nSigned by: Synthetic Receiver':'EXAMPLE FUEL RECEIPT\nDATE: 09/07/2026\nTOTAL: $55.00\nGALLONS: 12.00\nDIESEL FUEL\nEXAMPLE FUEL STATION';
   const bytes=simplePdf(text);savedInputs.set(kind,bytes);
   await page.locator('input[type=file][multiple]').first().setInputFiles({name:`synthetic-${kind}.pdf`,mimeType:'application/pdf',buffer:bytes});await page.getByRole('button',{name:'Read document',exact:true}).click();
   await page.getByLabel('Document type',{exact:true}).waitFor();
   // Source review is asynchronous after the initial type/load form renders.
   // Wait for its completion before changing type or acknowledging the review.
   await page.getByRole('button',{name:'All reading details',exact:true}).waitFor();
   if(await page.getByLabel('Document type',{exact:true}).inputValue()!==kind)await page.getByLabel('Document type',{exact:true}).selectOption(kind);
   await page.getByRole('button',{name:'All reading details',exact:true}).waitFor();
   assert.match(await page.getByRole('button',{name:'Choose load folder',exact:true}).innerText(),/82002/,'folder context carries into review');
   const logLink=page.getByLabel('Also show under Logbook supporting documents',{exact:false});if(await logLink.count())assert.equal(await logLink.isChecked(),false);
   await page.getByLabel('Document date',{exact:true}).fill('2026-09-07');
   const review=page.locator('.scan-driver-check-v105 input');await review.waitFor();assert.equal(await page.getByRole('button',{name:/^Save document$|^Save for review$/}).isDisabled(),true);await review.check();
   await page.screenshot({path:`${out}/${name}-${kind}-review.png`,fullPage:true});await page.getByRole('button',{name:/^Save document$|^Save for review$/}).click();await page.locator('.scan-saved-v105').waitFor();
   const data=await stored(page);const doc=data.business.documents.find(d=>d.type===kind&&d.loadNo==='82002');assert.ok(doc,kind+' saved under requested folder');assert.ok(data.document_blobs.some(r=>r.bytes&&Buffer.from(r.bytes).equals(bytes)),kind+' exact source PDF bytes durable');
   assert.deepEqual(protectedData(await snapshot(page)),protectedBefore,'scanner does not mutate duty or signed records');
   await page.getByRole('button',{name:'Done · Open load folder',exact:true}).click();root=page.getByRole('region',{name:'Smart load folders',exact:true});await root.getByRole('heading',{name:'82002',exact:true}).waitFor();await fit(page);
  }
  await page.reload();await folders(page);root=page.getByRole('region',{name:'Smart load folders',exact:true});await root.locator('.rr-smart-card').filter({hasText:'Load 82002'}).click();await root.getByRole('region',{name:'Fuel receipts',exact:true}).getByText('Fuel receipt · 82002',{exact:true}).waitFor();
  await root.getByRole('button',{name:'Share documents',exact:true}).click();await root.getByRole('region',{name:'Share load documents',exact:true}).waitFor();assert.equal(await root.getByRole('region',{name:'Share load documents',exact:true}).getByRole('link').count(),3);
  const sharedBytes=await root.getByRole('region',{name:'Share load documents',exact:true}).getByRole('link').evaluateAll(async links=>Promise.all(links.map(async a=>Array.from(new Uint8Array(await(await fetch(a.href)).arrayBuffer())))));for(const bytes of [original,...savedInputs.values()])assert.ok(sharedBytes.some(b=>Buffer.from(b).equals(bytes)),'reloaded folder exposes each exact saved original');
  const after=await stored(page);for(const [kind,bytes] of savedInputs)assert.ok(after.document_blobs.some(r=>r.bytes&&Buffer.from(r.bytes).equals(bytes)),kind+' exact bytes survive reload');assert.deepEqual(after.document_blobs.find(r=>r.local_blob_id==='existing-blob'),before.document_blobs.find(r=>r.local_blob_id==='existing-blob'));assert.deepEqual(protectedData(await snapshot(page)),protectedBefore);await fit(page);assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/${name}-reloaded.png`,fullPage:true});console.log(`PASS ${name}: real reconciliation, Active/Completed/search, missing original, exact originals, POD/fuel review/save/reload, signed log nonmutation and 390px`);
 }catch(error){console.error({browser:name,errors,body:await page.locator('body').innerText()});await page.screenshot({path:`${out}/${name}-failure.png`,fullPage:true});throw error;}finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
