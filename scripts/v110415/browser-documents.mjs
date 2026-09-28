import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';

const output='browser-test-results/driver-documents-v110415';fs.mkdirSync(output,{recursive:true});
const pdf=await PDFDocument.create();
for(const [i,title] of ['Invoice','Rate confirmation','Pickup BOL','Signed POD'].entries()){const p=pdf.addPage([610+i*10,800]);p.drawText('Synthetic '+title,{x:40,y:700,size:20});}
const bytes=Buffer.from(await pdf.save()),hash=createHash('sha256').update(bytes).digest('hex');
const fields={date:'2026-09-25',loadNo:'TEST10',merchant:'Example Broker',origin:'12 Test Road, Alpha, IL',destination:'18 Test Ave, Beta, IN',pickupDate:'2026-09-24',deliveryDate:'2026-09-25',total:500,currency:'USD',reference:'TEST10',podSigned:true};
const packet={local_id:'packet-local',client_document_id:'packet-client',load_no:'TEST10',type:'supporting_packet',document_type:'supporting_packet',document_date:'2026-09-25',sha256:hash,mime_type:'application/pdf',original_file_name:'synthetic-packet.pdf',file_size_bytes:bytes.length,extracted:{evidenceFactsV1:{version:1,sourceSha256:hash,reviewedAt:'2026-09-25',fields,components:['invoice','rate_confirmation','bol','pod'].map((kind,i)=>({kind,fields,reviewed:true,pages:[i+1]}))}}};
const loads=[{id:'one',loadNo:'TEST10',origin:fields.origin,destination:fields.destination,broker:'Example Broker',documentWorkflowStage:'delivered',pickupDate:'2026-09-24',deliveryDate:'2026-09-25',gross:500},{id:'two',loadNo:'TEST20',origin:'Beta, IN',destination:'Gamma, OH',broker:'Future Broker',documentWorkflowStage:'picked_up',pickupDate:'2026-09-25',deliveryDate:'2026-09-28'},{id:'three',loadNo:'TEST30',origin:'Gamma, OH',destination:'Delta, PA',broker:'Cancelled Broker',documentWorkflowStage:'tonu',pickupDate:'2026-09-25',deliveryDate:'2026-09-25',gross:100},{id:'four',loadNo:'TEST40',origin:'Delta, PA',destination:'Epsilon, NJ',broker:'Missing Broker',documentWorkflowStage:'delivered',pickupDate:'2026-09-24',deliveryDate:'2026-09-25'}];
async function stored(page){return page.evaluate(async()=>{
 const db=await new Promise((ok,no)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
 const get=name=>new Promise((ok,no)=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
 const docs=await get('documents_local'),blobs=await get('document_blobs'),states=await get('app_snapshots');db.close();
 const s=states.find(s=>s.key==='owner-op-road-ready-state-v1')?.state;
 return {docs,blobs:await Promise.all(blobs.map(async b=>({id:b.client_document_id,bytes:[...new Uint8Array(await b.blob.arrayBuffer())]}))),logs:JSON.stringify({events:s.eventsByDay,team:s.teamLogbooksByDriverId,signature:s.signatureByDay,forms:s.formByDay,inspection:s.inspectionByDay,loadInfo:s.loadInfo}),business:localStorage.getItem('owner-op-road-ready-business-v1')};
});}
async function fits(page,locator){for(const b of await locator.evaluateAll(nodes=>nodes.map(el=>({w:el.clientWidth,scroll:el.scrollWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,screen:innerWidth}))))assert.ok(b.scroll<=b.w+1&&b.left>=-1&&b.right<=b.screen+1,JSON.stringify(b));}
for(const [name,browser] of [['chromium',chromium],['webkit',webkit]]){
 if(process.env.TEST_BROWSERS&&!process.env.TEST_BROWSERS.split(',').includes(name))continue;
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rr-driver-docs-'));
 const context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,acceptDownloads:true,serviceWorkers:'block'});
 let page;const errors=[];
 try{
  await setupRoutes(context);page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-09-27T15:00:00Z'));
  const state=baseState();state.view='logbook';state.testInstructionStore={loads:loads.map(load=>({...load,documentTransferDays:['2026-09-25']})),documents:[],fuel:[],expenses:[]};await seed(page,state,[{id:'packet',bytes:[...bytes]}]);
  await page.evaluate(async doc=>{const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});await new Promise((ok,no)=>{const tx=db.transaction('documents_local','readwrite');tx.objectStore('documents_local').put(doc);tx.oncomplete=ok;tx.onerror=()=>no(tx.error);});db.close();},packet);
  await page.reload();await page.getByRole('button',{name:/^Documents/}).first().click();const docs=page.getByRole('region',{name:'Documents',exact:true});await docs.waitFor();
  const before=await stored(page);await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).click();
  assert.equal(await docs.locator('.rr-docs-card').count(),4);
  assert.equal(await docs.locator('.rr-docs-card').filter({hasText:'Load TEST10'}).locator('strong').innerText(),'Alpha, IL → Beta, IN');
  assert.equal(await docs.getByRole('region',{name:'More document options',exact:true}).count(),0);
  await docs.getByRole('button',{name:'Needs attention',exact:true}).click();assert.equal(await docs.locator('.rr-docs-card').count(),3);assert.equal(await docs.locator('.rr-docs-card').filter({hasText:'Load TEST10'}).count(),0);
  await docs.getByRole('button',{name:'All 4',exact:true}).click();await page.screenshot({path:`${output}/${name}-week.png`,fullPage:true});
  await docs.locator('.rr-docs-card').filter({hasText:'Load TEST10'}).click();await docs.getByRole('heading',{name:'Load #TEST10',exact:true}).waitFor();
  const rows=docs.getByRole('list',{name:'Load documents',exact:true});assert.equal(await rows.locator('li').count(),4);assert.equal(await rows.getByText('✓ Saved',{exact:true}).count(),4);assert.equal(await docs.getByRole('region',{name:'Load review',exact:true}).count(),0,'general IFTA gaps are not load alerts');
  await docs.getByText('4 of 4 on file',{exact:true}).waitFor();await docs.getByText('$500 agreed',{exact:true}).waitFor();await docs.getByText('Delivered Sep 25',{exact:true}).waitFor();
  for(const width of [320,390,820]){await page.setViewportSize({width,height:844});await fits(page,docs);await fits(page,rows);await page.screenshot({path:`${output}/${name}-load-${width}.png`,fullPage:true});}
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{const url=create(blob);window.__documentUrl=url;return url;};});
  for(const [label,width] of [['Rate confirmation',620],['Pickup BOL',630],['Signed POD',640],['Invoice',610]]){
   await page.evaluate(()=>{window.__documentUrl='';});const opened=page.waitForEvent('popup');await rows.getByRole('button',{name:'Open '+label,exact:true}).click();const preview=await opened;
   await page.waitForFunction(()=>Boolean(window.__documentUrl));const selected=await page.evaluate(async()=>[...new Uint8Array(await(await fetch(window.__documentUrl)).arrayBuffer())]);
   const actual=await PDFDocument.load(new Uint8Array(selected));assert.equal(actual.getPageCount(),1);assert.equal(actual.getPage(0).getWidth(),width,`${label} opens its own page`);await preview.close();
  }
  await docs.getByText('View originals ›',{exact:true}).click();assert.equal(await docs.locator('.rr-docs-file').count(),1);
  await page.evaluate(()=>{window.__documentUrl='';});const originalPopup=page.waitForEvent('popup');await docs.locator('.rr-docs-file').click();const originalPreview=await originalPopup;await page.waitForFunction(()=>Boolean(window.__documentUrl));assert.deepEqual(await page.evaluate(async()=>[...new Uint8Array(await(await fetch(window.__documentUrl)).arrayBuffer())]),[...bytes]);await originalPreview.close();await docs.getByText('View originals ›',{exact:true}).click();
  // Native sharing receives original bytes, not the one-page viewer copy.
  await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async({files})=>{window.__shared=await Promise.all(files.map(async f=>({name:f.name,bytes:[...new Uint8Array(await f.arrayBuffer())]})));}});});
  await docs.getByRole('button',{name:'Share documents',exact:true}).click();const sharing=docs.getByRole('region',{name:'Share load documents',exact:true});await sharing.waitFor();
  const [download]=await Promise.all([page.waitForEvent('download'),sharing.getByRole('link',{name:'Download synthetic-packet.pdf',exact:true}).click()]);assert.deepEqual(fs.readFileSync(await download.path()),bytes);
  await sharing.getByRole('button',{name:'Share files',exact:true}).click();await page.waitForFunction(()=>Boolean(window.__shared));assert.deepEqual(await page.evaluate(()=>window.__shared),[{name:'synthetic-packet.pdf',bytes:[...bytes]}]);
  await sharing.getByRole('button',{name:'Close',exact:true}).click();await docs.getByRole('button',{name:'More document options',exact:true}).click();
  const more=docs.getByRole('region',{name:'More document options',exact:true});await more.getByRole('button',{name:'Export load',exact:true}).waitFor();await more.getByRole('button',{name:'Import load',exact:true}).waitFor();await more.getByRole('button',{name:'Import reviewed recovery',exact:true}).waitFor();
  await more.getByRole('button',{name:'Close',exact:true}).first().click();await docs.getByRole('button',{name:'Back to loads',exact:true}).click();await docs.locator('.rr-docs-card').filter({hasText:'Load TEST20'}).click();
  await docs.getByRole('button',{name:'Add Signed POD',exact:true}).getByText('Due 2026-09-28',{exact:true}).waitFor();assert.equal(await docs.getByRole('region',{name:'Share load documents',exact:true}).count(),0);
  await docs.getByRole('button',{name:'Back to loads',exact:true}).click();await docs.locator('.rr-docs-card').filter({hasText:'Load TEST30'}).click();assert.equal(await rows.locator('li').count(),2);assert.equal(await rows.getByRole('button',{name:/BOL|POD/}).count(),0,'cancelled TONU never asks for a BOL or POD');
  await docs.getByRole('button',{name:'Back to loads',exact:true}).click();await docs.getByRole('button',{name:'More document options',exact:true}).click();await more.getByRole('button',{name:'Export week',exact:true}).waitFor();await more.getByRole('button',{name:'Import week',exact:true}).waitFor();
  const after=await stored(page);assert.deepEqual(after,before,'viewing pages and sharing never modifies originals, business data or logbooks');assert.deepEqual(errors,[]);
  console.log(`PASS ${name} — route-first week, actionable filter, scoped load status, all four exact PDF pages, original downloads/native sharing, TONU/future delivery, More actions, 320/390/820px and unchanged data`);
 }catch(error){if(page){await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${name}-failure.txt`,await page.locator('body').innerText().catch(()=>''));}throw error;}
 finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
