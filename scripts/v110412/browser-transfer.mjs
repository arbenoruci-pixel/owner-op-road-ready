import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,simplePdf,origin} from '../v110328/browserFixture.mjs';

const output='browser-test-results/load-week-transfer-v110412';fs.mkdirSync(output,{recursive:true});
const bytes=[...simplePdf('Synthetic load transfer original\nLoad 82002\nSeptember 21, 2026')];
const business=()=>({loads:[{id:'load-a',loadNo:'82002',origin:'Alpha, IL',destination:'Beta, IN',status:'delivered',documentTransferDays:['2026-09-21']},{id:'load-b',loadNo:'83003',origin:'Beta, IN',destination:'Gamma, OH',status:'delivered',documentTransferDays:['2026-09-23']}],fuel:[{id:'fuel-week',date:'2026-09-24',total:40}],expenses:[{id:'expense-week',date:'2026-09-25',amount:8}],documents:[]});
async function stored(page){return page.evaluate(async()=>{
 const db=await new Promise((ok,no)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
 const get=name=>new Promise((ok,no)=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
 const docs=await get('documents_local'),blobs=await get('document_blobs'),states=await get('app_snapshots');db.close();
 return {docs,blobs:await Promise.all(blobs.map(async b=>({id:b.client_document_id,bytes:[...new Uint8Array(await window.__rrFixtureBlob(b.blob).arrayBuffer())]}))),state:states.find(s=>s.key==='owner-op-road-ready-state-v1')?.state,business:JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1'))};
});}
const logs=s=>JSON.stringify({events:s.eventsByDay,team:s.teamLogbooksByDriverId,signature:s.signatureByDay,forms:s.formByDay,inspection:s.inspectionByDay,loadInfo:s.loadInfo});
async function openMore(page){const button=page.getByRole('button',{name:'More document options',exact:true});if(await button.getAttribute('aria-expanded')!=='true')await button.click();}
async function files(page,kind,payload){
 await openMore(page);
 const area=page.getByLabel('Load and week transfer',{exact:true});
 const [chooser]=await Promise.all([page.waitForEvent('filechooser'),area.getByRole('button',{name:`Import ${kind}`,exact:true}).click()]);
 await chooser.setFiles({name:`road-ready-${kind}.json`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
}
for(const [name,browser] of [['chromium',chromium],['webkit',webkit]]) {
 if(process.env.TEST_BROWSERS && !process.env.TEST_BROWSERS.split(',').includes(name))continue;
 const contexts=[];let lastPage;
 async function device(source=false){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rr-transfer-'));
  const context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,acceptDownloads:true,serviceWorkers:'block'});contexts.push([context,profile]);
  await setupRoutes(context);const page=await context.newPage();lastPage=page;page.setDefaultTimeout(45000);
  page.on('pageerror',error=>{throw error;});await page.clock.setFixedTime(new Date('2026-09-25T18:00:00Z'));
  const state=baseState();state.view='logbook';state.testInstructionStore=source?business():{loads:[{id:'existing',loadNo:'LOCAL999',status:'active'}],expenses:[{id:'existing-expense',date:'2026-09-20',amount:17}],documents:[]};
  await seed(page,state,source?[{id:'a',bytes},{id:'a-second',bytes:[...bytes,10]},{id:'b',bytes:[...bytes,10,10]},{id:'loose',bytes:[...bytes,10,10,10]},{id:'loose-old',bytes:[...bytes,10,10,10,10]}]:[]);
  if(source) await page.evaluate(async()=>{
   const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});
   await new Promise((ok,no)=>{const tx=db.transaction('documents_local','readwrite');for(const id of ['a','a-second','b','loose','loose-old'])tx.objectStore('documents_local').put({local_id:id+'-local',client_document_id:id+'-client',load_no:id.startsWith('loose')?'':id==='b'?'83003':'82002',original_file_name:id+'.pdf',mime_type:'application/pdf',type:id==='b'?'pod':'bol',document_type:id==='b'?'pod':'bol',document_date:id==='loose-old'?'2026-09-16':'2026-09-23',status:'active',metadata:{testOriginal:true}});tx.oncomplete=ok;tx.onerror=()=>no(tx.error);});db.close();
  });
  await page.getByRole('button',{name:/^Documents/}).first().click();await page.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Loads',exact:true}).click();await page.locator('.rr-docs-browser').waitFor();
  return page;
 }
 try {
  const source=await device(true),sourceBefore=await stored(source);
  await source.locator('.rr-docs-card').filter({hasText:'Sep 21'}).click();
  await openMore(source);
  const transfer=source.getByLabel('Load and week transfer',{exact:true});
  await transfer.getByRole('button',{name:'Export week',exact:true}).click();
  await transfer.getByLabel('Prepared transfer',{exact:true}).waitFor();
  const [weekDownload]=await Promise.all([source.waitForEvent('download'),transfer.getByRole('link',{name:'Download transfer'}).click()]);
  const week=JSON.parse(fs.readFileSync(await weekDownload.path(),'utf8'));
  assert.equal(week.documents.length,4,'both same-kind originals exported even if display deduplicates them');assert.equal(week.records.loads.length,2);
  assert.equal(week.records.fuel.length,1);assert.equal(week.records.expenses.length,1);
  await source.locator('.rr-docs-card').filter({hasText:'Load 82002'}).click();
  await openMore(source);
  await transfer.getByRole('button',{name:'Export load',exact:true}).click();await transfer.getByLabel('Prepared transfer',{exact:true}).waitFor();
  const [loadDownload]=await Promise.all([source.waitForEvent('download'),transfer.getByRole('link',{name:'Download transfer'}).click()]);
  const load=JSON.parse(fs.readFileSync(await loadDownload.path(),'utf8'));assert.equal(load.documents.length,2);assert.equal(load.records.loads.length,1);assert.equal(load.records.fuel.length,0);
  assert.equal(logs((await stored(source)).state),logs(sourceBefore.state),'export leaves all duty evidence unchanged');
  for(const width of [320,390,820]){await source.setViewportSize({width,height:1000});assert.ok(await source.locator('.rr-transfer').evaluate(el=>el.getBoundingClientRect().right<=window.innerWidth+1));}
  await source.screenshot({path:`${output}/${name}-export-load.png`,fullPage:true});

  const target=await device(),before=await stored(target);
  await files(target,'week',week);await target.getByLabel('Review import',{exact:true}).waitFor();
  await target.getByRole('button',{name:'Cancel import',exact:true}).click();assert.equal((await stored(target)).docs.length,0);
  // A quota failure after document writes must roll the IndexedDB transaction back.
  await files(target,'week',week);await target.getByLabel('Review import',{exact:true}).waitFor();
  await target.evaluate(()=>{window.savedSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='owner-op-road-ready-business-v1')throw new DOMException('Test quota','QuotaExceededError');return window.savedSetItem.call(this,key,value);};});
  await target.getByRole('button',{name:'Import week now',exact:true}).click();await target.getByRole('alert').filter({hasText:'Import stopped:'}).waitFor();
  await target.evaluate(()=>{Storage.prototype.setItem=window.savedSetItem;});assert.equal((await stored(target)).docs.length,0);assert.deepEqual((await stored(target)).business,before.business);
  await target.getByRole('button',{name:'Import week now',exact:true}).click();await target.getByRole('status').filter({hasText:'Imported 4 documents'}).waitFor();
  let after=await stored(target);assert.equal(after.docs.length,4);assert.equal(after.business.loads.length,3);assert.equal(after.business.expenses.length,2);assert.equal(logs(after.state),logs(before.state));
  assert.deepEqual(after.blobs.find(b=>b.id==='a-client').bytes,bytes);assert.deepEqual(after.docs[0].metadata,{testOriginal:true});
  await target.reload();await target.getByRole('button',{name:/^Documents/}).first().click();
  await target.locator('.rr-docs-card').filter({hasText:'Sep 21'}).waitFor();
  await target.evaluate(async()=>{
   const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});
   await new Promise((ok,no)=>{const tx=db.transaction(['documents_local','document_blobs'],'readwrite');
    const docs=tx.objectStore('documents_local'),r=docs.get('a-local');r.onsuccess=()=>docs.put({...r.result,title:'My newer local title'});
    tx.objectStore('document_blobs').delete('transfer-blob-b-client');tx.oncomplete=ok;tx.onerror=()=>no(tx.error);});db.close();
  });
  await files(target,'week',week);await target.getByRole('button',{name:'Import week now',exact:true}).click();await target.getByRole('status').filter({hasText:'Imported 0 documents'}).waitFor();
  after=await stored(target);assert.equal(after.docs.length,4);assert.equal(after.business.loads.length,3);assert.equal(after.business.expenses.length,2);assert.equal(logs(after.state),logs(before.state));
  assert.equal(after.docs.find(d=>d.local_id==='a-local').title,'My newer local title');assert.equal(after.blobs.length,4,'the missing original is restored');
  await target.locator('.rr-docs-card').filter({hasText:'Sep 21'}).click();await target.getByText('Other documents this week (1)',{exact:true}).waitFor();await target.locator('.rr-docs-card').filter({hasText:'Load 82002'}).click();
  await openMore(target);
  await target.getByRole('button',{name:'Export load',exact:true}).click();await target.getByLabel('Prepared transfer',{exact:true}).waitFor();
  const [roundTrip]=await Promise.all([target.waitForEvent('download'),target.getByRole('link',{name:'Download transfer'}).click()]);
  const reexport=JSON.parse(fs.readFileSync(await roundTrip.path(),'utf8'));assert.equal(reexport.documents.length,2);assert.deepEqual(reexport.documents.map(d=>d.original.sha256).sort(),load.documents.map(d=>d.original.sha256).sort());
  await target.screenshot({path:`${output}/${name}-imported-load.png`,fullPage:true});

  const single=await device(),singleBefore=await stored(single);
  await single.evaluate(async item=>{
   const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});
   await new Promise((ok,no)=>{const tx=db.transaction('documents_local','readwrite');tx.objectStore('documents_local').put({...item.record,local_id:item.record.client_document_id,title:'Synced iPad edit',sha256:item.original.sha256,file_size_bytes:item.original.size});tx.oncomplete=ok;tx.onerror=()=>no(tx.error);});db.close();
  },load.documents[0]);
  await files(single,'load',load);await single.getByRole('button',{name:'Import load now',exact:true}).click();await single.getByRole('status').filter({hasText:'Imported 1 documents'}).waitFor();
  const singleAfter=await stored(single);assert.equal(singleAfter.docs.length,2);assert.equal(singleAfter.business.loads.length,2);assert.equal(logs(singleAfter.state),logs(singleBefore.state));
  assert.equal(singleAfter.docs.find(d=>d.client_document_id===load.documents[0].record.client_document_id).title,'Synced iPad edit');
  assert.equal(singleAfter.docs.find(d=>d.client_document_id===load.documents[0].record.client_document_id).local_id,load.documents[0].record.client_document_id);
  await single.evaluate(async clientId=>{
   const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});
   await new Promise((ok,no)=>{const tx=db.transaction('document_blobs','readwrite');tx.objectStore('document_blobs').delete('transfer-blob-'+clientId);tx.oncomplete=ok;tx.onerror=()=>no(tx.error);});db.close();
  },load.documents[0].record.client_document_id);
  const conflict=structuredClone(load),changed=Buffer.from(conflict.documents[0].original.base64,'base64');changed[changed.length-1]^=1;
  conflict.documents[0].original.base64=changed.toString('base64');conflict.documents[0].original.sha256=createHash('sha256').update(changed).digest('hex');
  await files(single,'load',conflict);await single.getByRole('button',{name:'Import load now',exact:true}).click();await single.getByRole('alert').filter({hasText:'checksum or size'}).waitFor();
  assert.equal((await stored(single)).blobs.length,1,'different self-consistent bytes cannot replace an offloaded original');
  console.log(`PASS ${name} — load/week export → file chooser → preview/cancel → quota rollback → import → reload → repeat import → byte-identical re-export; 320/390/820px; duty/profile preservation`);
 }catch(error){if(lastPage){await lastPage.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${name}-failure.txt`,await lastPage.locator('body').innerText().catch(()=>''));}throw error;}
 finally {for(const[context,profile]of contexts){await context.close();fs.rmSync(profile,{recursive:true,force:true});}}
}
