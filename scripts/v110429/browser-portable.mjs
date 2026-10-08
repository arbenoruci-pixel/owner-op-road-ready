// Isolated synthetic fixtures; setupRoutes blocks every cloud write.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,simplePdf} from '../v110328/browserFixture.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const original=simplePdf('Portable original BOL: keep these bytes');
const output='browser-test-results/portable-v110429';fs.mkdirSync(output,{recursive:true});
async function openBackup(page){await page.getByRole('button',{name:'Open logbook',exact:true}).click();await page.getByRole('button',{name:'Tools',exact:true}).click();await page.getByRole('button',{name:/^Backup Logs/}).click();await page.getByText('Local history detected',{exact:true}).waitFor();}
const empty=()=>({...baseState(),view:'logbook',eventsByDay:{},signatureByDay:{},inspectionByDay:{},formByDay:{},certifyStatus:{},routeLegsByDay:{},loadInfo:{},loadGuidesById:{},testInstructionStore:{}});
async function contents(page){return page.evaluate(async()=>{
 const db=await new Promise((ok,no)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
 const rows={};for(const name of ['app_snapshots','document_blobs'])rows[name]=await new Promise((ok,no)=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});db.close();
 return {state:rows.app_snapshots.find(row=>row.key==='owner-op-road-ready-state-v1')?.state,originals:await Promise.all(rows.document_blobs.map(async row=>({id:row.local_blob_id,bytes:Array.from(new Uint8Array(await window.__rrFixtureBlob(row.blob).arrayBuffer()))}))),business:JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')||'{}')};
});}
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const profiles=[];
 async function device(run){const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rr-portable-'));profiles.push(profile);const context=await engine.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});await setupRoutes(context);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-09-27T15:00:00Z'));try{await run(page);assert.deepEqual(errors,[]);}catch(error){console.error({errors,body:await page.locator('body').innerText()});await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true});throw error;}finally{await context.close();}}
 try{
  let archive,expected;
  await device(async page=>{
   const state=baseState();state.view='logbook';state.customByDay={'2026-09-07':{note:'preserve extra fields'}};state.testInstructionStore={loads:[{loadNo:'PORTABLE-1',gross:1800}],expenses:[{id:'portable-expense',amount:42}]};
   await seed(page,state,[{id:'portable',bytes:[...original]}]);expected=await contents(page);await openBackup(page);
   await page.getByRole('button',{name:'Export Everything',exact:true}).click();const ready=page.getByRole('region',{name:'Backup ready to save'});await ready.waitFor();
   archive=await ready.getByRole('link',{name:'Download backup',exact:true}).evaluate(async a=>(await fetch(a.href)).json());
   assert.equal(archive.payload.localStorage.some(row=>/auth|session|token|prepared-device-safety/.test(row.key)),false);assert.equal(archive.portableFormat,'road_ready_everything_v1');assert.equal(archive.payloadSha256,sha(JSON.stringify(archive.payload)));assert.equal(archive.portableReview.loads[0].loadNo,'PORTABLE-1');
   await page.screenshot({path:`${output}/${name}-export.png`,fullPage:true});
  });
  const file=value=>({name:'everything.roadready.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  await device(async page=>{
   const state=baseState();state.view='logbook';state.testInstructionStore={};await seed(page,state);await openBackup(page);const before=await contents(page);
   await page.locator('input[type=file]').first().setInputFiles(file(archive));
   await page.getByRole('status').filter({hasText:'Choose the backup exported from this device'}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Import Everything',exact:true}).isDisabled(),true);
   assert.equal(await page.evaluate(()=>localStorage.getItem('owner-op-road-ready-last-device-safety-export-v1')),null);
   assert.deepEqual(await contents(page),before);
  });
  await device(async page=>{
   await seed(page,empty());await openBackup(page);const before=await contents(page);
   const corrupted=structuredClone(archive);corrupted.payload.state.customByDay['2026-09-07'].note='tampered';
   await page.locator('input[type=file]').last().setInputFiles(file(corrupted));await page.getByRole('status').filter({hasText:'checksum mismatch'}).waitFor();assert.deepEqual(await contents(page),before);
   page.once('dialog',dialog=>dialog.dismiss());await page.locator('input[type=file]').last().setInputFiles(file(archive));await page.getByRole('status').filter({hasText:'Import cancelled'}).waitFor();assert.deepEqual(await contents(page),before);
   // Force a late table-write failure and prove the preceding table replacements roll back.
   await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;window.restorePut=()=>{IDBObjectStore.prototype.put=put;};IDBObjectStore.prototype.put=function(...args){if(this.name==='document_blobs')throw new DOMException('Synthetic full device','QuotaExceededError');return put.apply(this,args);};});
   page.once('dialog',dialog=>dialog.accept());await page.locator('input[type=file]').last().setInputFiles(file(archive));await page.getByRole('status').filter({hasText:/Synthetic full device|QuotaExceeded/}).waitFor();assert.deepEqual(await contents(page),before);await page.evaluate(()=>window.restorePut());
   const auth=await page.evaluate(()=>localStorage.getItem('owner-op-prototype-auth-v1'));
   page.once('dialog',dialog=>dialog.accept());await Promise.all([page.waitForEvent('load'),page.locator('input[type=file]').last().setInputFiles(file(archive))]);await page.getByRole('button',{name:'Insert',exact:true}).waitFor();
   const restored=await contents(page);for(const key of ['eventsByDay','signatureByDay','inspectionByDay','customByDay'])assert.deepEqual(restored.state[key],expected.state[key]);
   assert.deepEqual(restored.originals,expected.originals);assert.equal(sha(Buffer.from(restored.originals[0].bytes)),sha(original));assert.deepEqual(restored.business.loads,archive.payload.businessStore.loads);assert.equal(restored.business.expenses[0].amount,42);assert.equal(await page.evaluate(()=>localStorage.getItem('owner-op-prototype-auth-v1')),auth);
   await page.reload();await page.getByRole('button',{name:'Insert',exact:true}).waitFor();assert.deepEqual((await contents(page)).originals,expected.originals);
   await page.screenshot({path:`${output}/${name}-restored.png`,fullPage:true});
  });
  console.log(`PASS ${name}: portable export, checksum rejection, cancel, atomic rollback, fresh-device import, original bytes, session preservation and reload`);
 }finally{for(const profile of profiles)fs.rmSync(profile,{recursive:true,force:true});}
}
