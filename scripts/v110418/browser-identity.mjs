import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,simplePdf} from '../v110328/browserFixture.mjs';

const output='browser-test-results/reviewed-identity-v110418';fs.mkdirSync(output,{recursive:true});
const fields={loadNo:'LOAD300',date:'2026-09-25',reference:'BOL55',origin:'Alpha, NJ',destination:'Beta, IL'};
const loads=[{id:'native',loadNo:'LOAD300',broker:'Example Broker',origin:fields.origin,destination:fields.destination,pickupDate:'2026-09-25',deliveryDate:'2026-09-28',documentWorkflowStage:'picked_up',gross:500},
 {id:'second',loadNo:'LOAD400',broker:'Second Broker',pickupDate:'2026-09-25',deliveryDate:'2026-09-28',documentWorkflowStage:'picked_up'},
 {id:'prior',loadNo:'PRIOR500',pickupDate:'2026-09-14',documentWorkflowStage:'booked'}];
const files=[],documents=[];
function source(id,kind,f,reviewed){
 const bytes=simplePdf(`Synthetic ${kind}: broker ${f.loadNo}, reference ${f.reference||'none'}`),hash=createHash('sha256').update(bytes).digest('hex');
 files.push({id,bytes:[...bytes]});
 const doc={local_id:id+'-local',client_document_id:id+'-client',load_no:f.loadNo,loadNo:f.loadNo,canonicalLoadNo:f.loadNo,type:kind,document_type:kind,document_date:f.date,mime_type:'application/pdf',sha256:hash,original_file_name:id+'.pdf',file_size_bytes:bytes.length,extracted:{...f,...(reviewed?{evidenceFactsV1:{version:1,source:'source_recovery',sourceSha256:hash,reviewedAt:'2026-09-27T10:00:00Z',fields:f,components:[]}}:{})}};
 documents.push(doc);return doc;
}
const bol=source('reviewed-bol','bol',fields,true);bol.loadNo='BOL55';bol.extracted.loadNo='BOL55';bol.extracted.canonicalLoadNo='OLD100';
source('rate','rate_confirmation',{...fields,merchant:'Example Broker',pickupDate:'2026-09-25',deliveryDate:'2026-09-28',total:500},true);
const pending=source('pending-bol','bol',{...fields,loadNo:'LOAD400',reference:'BOL66'},false);pending.extracted.loadNo='BOL66';
async function stored(page){return page.evaluate(async()=>{
 const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});
 const get=name=>new Promise(ok=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>ok(r.result);});
 const docs=await get('documents_local'),blobs=await get('document_blobs'),snapshots=await get('app_snapshots');db.close();
 const state=snapshots.find(s=>s.key==='owner-op-road-ready-state-v1')?.state||{};
 return {business:JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')),docs,logs:Object.fromEntries(['eventsByDay','routeLegsByDay','signatureByDay','formByDay'].map(k=>[k,state[k]])),blobs:await Promise.all(blobs.map(async b=>({id:b.client_document_id,bytes:[...new Uint8Array(await window.__rrFixtureBlob(b.blob).arrayBuffer())]})))};
});}
for(const [name,browser] of [['chromium',chromium],['webkit',webkit]]){
 if(process.env.TEST_BROWSERS&&!process.env.TEST_BROWSERS.split(',').includes(name))continue;
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rr-reviewed-identity-'));
 const context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
 let page;const errors=[];
 try {
  await setupRoutes(context);page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-09-27T15:00:00Z'));
  const state=baseState();state.view='logbook';state.testInstructionStore={loads,documents:[],fuel:[],expenses:[]};await seed(page,state,files);
  await page.evaluate(async records=>{const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});await new Promise((ok,no)=>{const tx=db.transaction('documents_local','readwrite');for(const doc of records)tx.objectStore('documents_local').put(doc);tx.oncomplete=ok;tx.onerror=()=>no(tx.error);});db.close();},documents);
  await page.reload();await page.getByRole('button',{name:/^Documents/}).first().click();await page.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Loads',exact:true}).click();
  const docs=page.getByRole('region',{name:'Documents',exact:true});await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).waitFor();const before=await stored(page);
  assert.equal(await docs.locator('.rr-docs-card').filter({hasText:'Sep 28'}).count(),0);
  await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).click();assert.equal(await docs.locator('.rr-driver-load-id>span').count(),2);
  await docs.locator('.rr-docs-card').filter({hasText:'Load LOAD300'}).click();
  await docs.getByRole('list',{name:'Load documents',exact:true}).waitFor();assert.equal(await docs.getByRole('region',{name:'Load checks',exact:true}).count(),0,'verified broker and BOL need no warning');
  await docs.getByText('2 of 4 on file',{exact:true}).waitFor();await docs.getByText('Delivery Sep 28',{exact:true}).waitFor();
  for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.ok(await docs.evaluate(el=>el.scrollWidth<=el.clientWidth+1));}
  await page.screenshot({path:`${output}/${name}-reviewed-load.png`,fullPage:true});assert.deepEqual(await stored(page),before,'opening the reviewed load never rewrites records');
  await docs.getByRole('button',{name:'Back to loads',exact:true}).click();await docs.locator('.rr-docs-card').filter({hasText:'Load LOAD400'}).click();await docs.locator('.rr-driver-check-toggle').click();
  const row=docs.locator('.rr-evidence-rows>li').filter({hasText:'Check broker load number'});await row.getByText('Saved load numbers: LOAD400, BOL66. Confirm the broker load number on this document.',{exact:true}).waitFor();await row.getByRole('button',{name:'Review source',exact:true}).click();
  const review=docs.getByRole('region',{name:'Review document evidence',exact:true});assert.equal(await review.getByLabel('Broker load number',{exact:true}).inputValue(),'LOAD400');assert.equal(await review.getByLabel('BOL reference',{exact:true}).inputValue(),'BOL66');
  await review.getByRole('button',{name:'Save reviewed details',exact:true}).click();await docs.getByRole('status').filter({hasText:'Reviewed source details saved.'}).waitFor();assert.equal(await docs.getByText('Check broker load number',{exact:true}).count(),0);
  const after=await stored(page),saved=after.docs.find(d=>d.local_id==='pending-bol-local');assert.equal(saved.extracted.evidenceFactsV1.fields.reference,'BOL66');assert.equal(saved.extracted.evidenceFactsV1.fields.loadNo,'LOAD400');
  assert.deepEqual(after.business.loads,before.business.loads);assert.deepEqual(after.logs,before.logs);assert.deepEqual(after.blobs,before.blobs);assert.deepEqual(after.docs.find(d=>d.local_id==='reviewed-bol-local'),before.docs.find(d=>d.local_id==='reviewed-bol-local'));
  await page.reload();await page.getByRole('button',{name:/^Documents/}).first().click();await page.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Loads',exact:true}).click();await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).click();await docs.locator('.rr-docs-card').filter({hasText:'Load LOAD300'}).click();assert.equal(await docs.getByRole('region',{name:'Load checks',exact:true}).count(),0);
  await docs.getByRole('button',{name:'Back to loads',exact:true}).click();await docs.locator('.rr-docs-card').filter({hasText:'Load LOAD400'}).click();await docs.locator('.rr-driver-check-toggle').click();assert.equal(await docs.getByText('Check broker load number',{exact:true}).count(),0,'explicit review stays resolved after reload');assert.deepEqual(errors,[]);
  console.log(`PASS ${name} — reviewed BOL has no false conflict; real conflict, distinct fields, save/reload, weeks, original bytes and logs verified`);
 }catch(error){if(page){await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${name}-failure.txt`,await page.locator('body').innerText().catch(()=>''));}throw error;}
 finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
