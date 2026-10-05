import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,simplePdf} from '../v110328/browserFixture.mjs';
const output='browser-test-results/source-copies-v110419';fs.mkdirSync(output,{recursive:true});
const fields={loadNo:'LOAD300',date:'2026-09-25',reference:'BOL55',origin:'Alpha, NJ',destination:'Beta, IL'};
const loads=[{id:'ag',loadNo:'LOAD100',broker:'First Broker',origin:'West, IL',destination:'East, ME',pickupDate:'2026-09-23',deliveryDate:'2026-09-24',documentWorkflowStage:'delivered',gross:700,notes:'Route discrepancy: compare the pickup and delivery addresses.'},
{id:'mc',loadNo:'LOAD300',broker:'Second Broker',origin:fields.origin,destination:fields.destination,pickupDate:'2026-09-25',deliveryDate:'2026-09-28',documentWorkflowStage:'picked_up',gross:500},
{id:'prior',loadNo:'PRIOR500',pickupDate:'2026-09-14',documentWorkflowStage:'booked'}];
const files=[],documents=[];
function source(id,kind,f,bytes=simplePdf('Synthetic '+id)){
 const hash=createHash('sha256').update(bytes).digest('hex');files.push({id,bytes:[...bytes]});
 const doc={local_id:id+'-local',client_document_id:id+'-client',load_no:f.loadNo,loadNo:f.loadNo,type:kind,document_type:kind,document_date:f.date,mime_type:'application/pdf',sha256:hash,original_file_name:id+'.pdf',file_size_bytes:bytes.length,extracted:{...f,evidenceFactsV1:{version:1,source:'source_recovery',sourceSha256:hash,reviewedAt:'2026-09-27T10:00:00Z',fields:f,components:[]}}};
 documents.push(doc);return doc;
}
const bolBytes=simplePdf('Synthetic BOL55 for broker LOAD300');
const bol=source('confirmed-bol','bol',fields,bolBytes);
bol.extracted.readerReviewV110345={version:1,remaining:1,documents:[{id:'page-1',label:'Bill of lading',pages:[1],fields:{shipper:{label:'Shipper',value:'to be not'}}}]};
const old=source('old-bol-copy','bol',{...fields,loadNo:'LOAD100',origin:'to be not',destination:''},bolBytes);delete old.extracted.evidenceFactsV1;old.updated_at='2026-09-28T01:00:00Z';
documents.push({...structuredClone(old),local_id:'legacy-local',client_document_id:bol.client_document_id,original_file_name:'legacy-copy.pdf'});
source('ag-bol','bol',{...fields,loadNo:'LOAD100',reference:'BOL99',date:'2026-09-23',origin:'West, IL',destination:'East, ME'});
source('rate','rate_confirmation',{...fields,merchant:'Second Broker',pickupDate:'2026-09-25',deliveryDate:'2026-09-28',total:500});
async function stored(page){return page.evaluate(async()=>{
 const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});
 const get=name=>new Promise(ok=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>ok(r.result);});
 const docs=await get('documents_local'),blobs=await get('document_blobs'),snapshots=await get('app_snapshots');db.close();
 const state=snapshots.find(s=>s.key==='owner-op-road-ready-state-v1')?.state||{};
 return {business:JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')),docs,logs:Object.fromEntries(['eventsByDay','routeLegsByDay','signatureByDay','formByDay'].map(k=>[k,state[k]])),blobs:await Promise.all(blobs.map(async b=>({id:b.client_document_id,bytes:[...new Uint8Array(await b.blob.arrayBuffer())]})))};
});}
for(const [name,browser] of [['chromium',chromium],['webkit',webkit]]){
 if(process.env.TEST_BROWSERS&&!process.env.TEST_BROWSERS.split(',').includes(name))continue;
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rr-source-copies-'));
 const context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
 let page;const errors=[];
 try{
  await setupRoutes(context);page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-09-27T15:00:00Z'));
  const state=baseState();state.view='logbook';state.testInstructionStore={loads,documents:[{id:'mirror',localDocumentId:old.local_id,clientDocumentId:old.client_document_id,loadNo:'LOAD100',type:'bol',sha256:old.sha256}],fuel:[],expenses:[]};await seed(page,state,files);
  await page.evaluate(async records=>{const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});await new Promise((ok,no)=>{const tx=db.transaction('documents_local','readwrite');for(const doc of records)tx.objectStore('documents_local').put(doc);tx.oncomplete=ok;tx.onerror=()=>no(tx.error);});db.close();},documents);
  await page.reload();await page.getByRole('button',{name:/^Documents/}).first().click();await page.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Loads',exact:true}).click();
  const docs=page.getByRole('region',{name:'Documents',exact:true});await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).waitFor();const before=await stored(page);
  assert.equal(await docs.locator('.rr-docs-card').filter({hasText:'Sep 14'}).count(),1);assert.equal(await docs.locator('.rr-docs-card').filter({hasText:'Sep 28'}).count(),0);
  await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).click();assert.equal(await docs.locator('.rr-driver-load-id>span').count(),2);
  await docs.locator('.rr-docs-card').filter({hasText:'Load LOAD100'}).click();await docs.getByText('Stored in 1 original file',{exact:true}).waitFor();
  await docs.locator('.rr-driver-check-toggle').click();await docs.getByRole('region',{name:'Load checks',exact:true}).getByText('Route discrepancy: compare the pickup and delivery addresses.',{exact:true}).waitFor();assert.equal(await docs.getByText('Source details need review',{exact:true}).count(),0);
  await docs.getByRole('button',{name:'Back to loads',exact:true}).click();await docs.locator('.rr-docs-card').filter({hasText:'Load LOAD300'}).click();await docs.getByText('Stored in 2 original files',{exact:true}).waitFor();await docs.getByText('2 of 4 on file',{exact:true}).waitFor();assert.equal(await docs.getByRole('region',{name:'Load checks',exact:true}).count(),0);
  assert.deepEqual(await stored(page),before,'opening the fixed views never writes source records or logs');
  await page.screenshot({path:`${output}/${name}-correct-load.png`,fullPage:true});
  await docs.getByRole('button',{name:'More document options',exact:true}).click();const tools=docs.getByRole('region',{name:'More document options',exact:true});
  await tools.getByRole('button',{name:'Choose saved document',exact:true}).click();await tools.getByLabel('Choose saved source',{exact:true}).selectOption(bol.client_document_id);
  const review=tools.getByRole('region',{name:'Review document evidence',exact:true});await review.getByText('Reviewed document details',{exact:true}).click();await review.getByText('Confirmed for Load LOAD300.',{exact:true}).waitFor();
  assert.equal(await review.getByText('to be not',{exact:true}).count(),0,'current confirmed facts replace old reading in the summary');
  assert.equal(await review.getByLabel('Broker load number',{exact:true}).inputValue(),'LOAD300');assert.equal(await review.getByLabel('BOL reference',{exact:true}).inputValue(),'BOL55');assert.equal(await review.getByLabel('Pickup location',{exact:true}).inputValue(),fields.origin);
  const download=review.getByRole('link',{name:'Download',exact:true});await download.waitFor();assert.deepEqual(await download.evaluate(async el=>[...new Uint8Array(await (await fetch(el.href)).arrayBuffer())]),[...bolBytes]);
  await review.getByRole('button',{name:'Save reviewed details',exact:true}).click();await tools.getByRole('status').filter({hasText:'Reviewed source details saved.'}).waitFor();
  const saved=await stored(page);assert.deepEqual(saved.logs,before.logs);assert.deepEqual(saved.business.loads,before.business.loads);assert.deepEqual(saved.blobs,before.blobs);assert.deepEqual(saved.docs.find(d=>d.local_id===old.local_id),before.docs.find(d=>d.local_id===old.local_id));assert.deepEqual(saved.docs.find(d=>d.local_id==='legacy-local'),before.docs.find(d=>d.local_id==='legacy-local'));
  await tools.getByRole('button',{name:'Export load',exact:true}).click();const transfer=tools.getByRole('link',{name:'Download transfer',exact:true});await transfer.waitFor();const payload=await transfer.evaluate(async el=>(await fetch(el.href)).json());
  assert.equal(payload.documents.length,3,'transfer preserves both distinct BOL originals and the rate confirmation');assert.ok(payload.documents.every(d=>d.record.load_no==='LOAD300'));assert.equal(payload.documents.filter(d=>d.original.sha256===bol.sha256).length,2);
  for(const item of payload.documents)assert.equal(createHash('sha256').update(Buffer.from(item.original.base64,'base64')).digest('hex'),item.original.sha256);
  await page.reload();await page.getByRole('button',{name:/^Documents/}).first().click();await page.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Loads',exact:true}).click();await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).click();await docs.locator('.rr-docs-card').filter({hasText:'Load LOAD100'}).click();await docs.getByText('Stored in 1 original file',{exact:true}).waitFor();
  await docs.getByRole('button',{name:'Back to loads',exact:true}).click();await docs.locator('.rr-docs-card').filter({hasText:'Load LOAD300'}).click();await docs.getByText('Stored in 2 original files',{exact:true}).waitFor();assert.equal(await docs.getByRole('region',{name:'Load checks',exact:true}).count(),0);
  for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.ok(await docs.evaluate(el=>el.scrollWidth<=el.clientWidth+1));}assert.deepEqual(errors,[]);
  console.log(`PASS ${name} — wrong-load copies removed from view; confirmed details, editable legacy identity, export originals, reload, weeks and logs verified`);
 }catch(error){if(page){await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${name}-failure.txt`,await page.locator('body').innerText().catch(()=>''));}throw error;}
 finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
