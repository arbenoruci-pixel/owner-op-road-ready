import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,simplePdf} from '../v110328/browserFixture.mjs';

const output='browser-test-results/clear-loads-v110417';fs.mkdirSync(output,{recursive:true});
const pdf=await PDFDocument.create();for(const title of ['Invoice','Rate confirmation','BOL','POD']){const page=pdf.addPage();page.drawText('Synthetic '+title);}
const bytes=Buffer.from(await pdf.save()),hash=createHash('sha256').update(bytes).digest('hex');
const extra=simplePdf('Synthetic pickup photo source'),extraHash=createHash('sha256').update(extra).digest('hex');
const fields={date:'2026-09-24',loadNo:'LOAD100',merchant:'Example Broker',origin:'12 Test Road, Alpha, IL',destination:'18 Test Ave, Beta, IN',pickupDate:'2026-09-23',deliveryDate:'2026-09-24',total:500,currency:'USD',reference:'BOL100',podSigned:true};
const packet={local_id:'packet-local',client_document_id:'packet-client',load_no:'LOAD100',type:'supporting_packet',document_type:'supporting_packet',document_date:'2026-09-24',sha256:hash,mime_type:'application/pdf',original_file_name:'synthetic-packet.pdf',file_size_bytes:bytes.length,extracted:{evidenceFactsV1:{version:1,sourceSha256:hash,reviewedAt:'2026-09-27',fields,components:['invoice','rate_confirmation','bol','pod'].map((kind,i)=>({kind,fields,reviewed:true,pages:[i+1]}))}}};
const photograph={local_id:'photo-local',client_document_id:'photo-client',load_no:'LOAD100',type:'other',document_type:'other',document_date:'2026-09-23',mime_type:'application/pdf',sha256:extraHash,original_file_name:'synthetic-photo.pdf',file_size_bytes:extra.length};
const note='Source discrepancy: pickup and delivery locations differ between the rate confirmation and the signed BOL. Check the originals.';
const loads=[
 {id:'a',loadNo:'LOAD100',broker:'Example Broker',origin:fields.origin,destination:fields.destination,pickupDate:'2026-09-23',deliveryDate:'2026-09-24',documentWorkflowStage:'delivered',gross:500,notes:note},
 {id:'b',loadNo:'LOAD200',broker:'Second Broker',origin:'Beta, IN',destination:'Gamma, OH',pickupDate:'2026-09-24',deliveryDate:'2026-09-25',documentWorkflowStage:'delivered'},
 {id:'c',loadNo:'LOAD300',broker:'Future Broker',origin:'Gamma, OH',destination:'Delta, NJ',pickupDate:'2026-09-25',deliveryDate:'2026-09-28',documentWorkflowStage:'picked_up'},
 {id:'d',loadNo:'LOAD400',broker:'Cancelled Broker',origin:'Delta, NJ',destination:'Alpha, IL',pickupDate:'2026-09-25',documentWorkflowStage:'tonu'},
 {id:'e',loadNo:'PRIOR500',broker:'Prior Week',origin:'Alpha, IL',destination:'Beta, IN',pickupDate:'2026-09-14',documentWorkflowStage:'booked'}
];
async function stored(page){return page.evaluate(async()=>{
 const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});
 const get=name=>new Promise(ok=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>ok(r.result);});
 const docs=await get('documents_local'),blobs=await get('document_blobs'),snapshots=await get('app_snapshots');db.close();
 const s=snapshots.find(s=>s.key==='owner-op-road-ready-state-v1')?.state||{};
 return {business:localStorage.getItem('owner-op-road-ready-business-v1'),docs,logs:Object.fromEntries(['eventsByDay','routeLegsByDay','signatureByDay','formByDay'].map(k=>[k,s[k]])),blobs:await Promise.all(blobs.map(async b=>({id:b.client_document_id,bytes:[...new Uint8Array(await b.blob.arrayBuffer())]})))};
});}
for(const [name,browser] of [['chromium',chromium],['webkit',webkit]]){
 if(process.env.TEST_BROWSERS&&!process.env.TEST_BROWSERS.split(',').includes(name))continue;
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rr-clear-loads-'));
 const context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',colorScheme:'dark'});
 let page;const errors=[];
 try{
  await setupRoutes(context);page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-09-27T15:00:00Z'));
  const state=baseState();state.view='logbook';state.testInstructionStore={loads,documents:[],fuel:[],expenses:[]};
  state.routeLegsByDay['2026-09-23']=[{id:'trip-a',loadNo:'LOAD100',date:'2026-09-23',fromCity:'Alpha',fromState:'IL',toCity:'Beta',toState:'IN',kind:'loaded',status:'closed'}];
  state.routeLegsByDay['2026-09-25']=[{id:'trip-a-later',loadNo:'LOAD100',date:'2026-09-25',kind:'loaded',status:'closed'}];
  await seed(page,state,[{id:'packet',bytes:[...bytes]},{id:'photo',bytes:[...extra]}]);
  await page.evaluate(async documents=>{const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});await new Promise((ok,no)=>{const tx=db.transaction('documents_local','readwrite');for(const doc of documents)tx.objectStore('documents_local').put(doc);tx.oncomplete=ok;tx.onerror=()=>no(tx.error);});db.close();},[packet,photograph]);
  await page.reload();await page.getByRole('button',{name:/^Documents/}).first().click();
  const docs=page.getByRole('region',{name:'Documents',exact:true});await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).waitFor();const before=await stored(page);
  assert.equal(await docs.locator('.rr-docs-card').filter({hasText:'Sep 28'}).count(),0);
  assert.equal(await docs.locator('.rr-docs-card').filter({hasText:'Date not set'}).count(),0,'saved pickup dates prevent undated loads');
  await docs.locator('.rr-docs-card').filter({hasText:'Sep 14'}).click();await docs.getByText('Load PRIOR500',{exact:true}).waitFor();await docs.getByRole('button',{name:'Back to weeks',exact:true}).click();
  await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).click();
  assert.deepEqual(await docs.locator('.rr-driver-load-id>span').allTextContents(),['Load LOAD300','Load LOAD400','Load LOAD200','Load LOAD100']);
  const ag=docs.locator('.rr-docs-card').filter({hasText:'Load LOAD100'});await ag.getByText('Sep 23 – Sep 24 · Delivered',{exact:true}).waitFor();
  await docs.locator('.rr-docs-card').filter({hasText:'Load LOAD300'}).getByText('Pickup Sep 25 · Delivery Sep 28',{exact:true}).waitFor();
  await page.screenshot({path:`${output}/${name}-week.png`,fullPage:true});
  await ag.click();await docs.getByText('Delivered Sep 24',{exact:true}).waitFor();
  const checks=docs.getByRole('region',{name:'Load checks',exact:true});const toggle=checks.getByRole('button',{name:'! 1 item to check View ›',exact:true});await toggle.waitFor();
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await checks.getByText(note,{exact:true}).count(),0);
  const rows=docs.getByRole('list',{name:'Load documents',exact:true});assert.equal(await rows.locator('li').count(),4);
  for(const width of [320,390,820]){
   await page.setViewportSize({width,height:844});assert.ok(await docs.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'no horizontal overflow');
   const checkHeight=await checks.evaluate(el=>el.getBoundingClientRect().height);assert.ok(checkHeight<=76,'one compact check row');
   const distance=await rows.evaluate(el=>el.getBoundingClientRect().top-el.closest('.rr-docs-browser').getBoundingClientRect().top);assert.ok(distance<430,'documents start near the load header');
   await page.screenshot({path:`${output}/${name}-load-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});await toggle.click();await checks.getByText(note,{exact:true}).waitFor();
  const supporting=docs.locator('details').filter({has:page.getByText('Supporting files to review (1)',{exact:true})});await supporting.locator('summary').click();
  await supporting.getByRole('button',{name:'Review source',exact:true}).click();const review=supporting.getByRole('region',{name:'Review document evidence',exact:true});await review.waitFor();await review.getByRole('button',{name:'Close review',exact:true}).click();
  await checks.locator('.rr-driver-check-toggle').click();assert.equal(await checks.getByText(note,{exact:true}).count(),0);
  await checks.locator('.rr-driver-check-toggle').click();await docs.getByRole('button',{name:'Back to loads',exact:true}).click();await docs.locator('.rr-docs-card').filter({hasText:'Load LOAD100'}).click();
  assert.equal(await docs.locator('.rr-driver-check-toggle').getAttribute('aria-expanded'),'false','checks reset when opening a load');
  await docs.getByRole('button',{name:'Back to loads',exact:true}).click();await docs.getByRole('button',{name:'Back to weeks',exact:true}).click();
  await page.reload();await page.getByRole('button',{name:/^Documents/}).first().click();await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).click();assert.deepEqual(await docs.locator('.rr-driver-load-id>span').allTextContents(),['Load LOAD300','Load LOAD400','Load LOAD200','Load LOAD100']);
  assert.deepEqual(await stored(page),before);assert.deepEqual(errors,[]);
  console.log(`PASS ${name} — service dates, chronological load identities, weekly navigation, one collapsed check, working source review, 320/390/820px, reload and unchanged originals/logs`);
 }catch(error){if(page){await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${name}-failure.txt`,await page.locator('body').innerText().catch(()=>''));}throw error;}
 finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
