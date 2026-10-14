import {selectedLoadFolder} from '../test-support/load-folder-browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
import {routeTableInput} from '../../packages/smart-reader-core/test/rate-vocabulary-fixture.mjs';
const output='browser-test-results/smart-rate-v110464';fs.mkdirSync(output,{recursive:true});
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
for(const input of routeTableInput().pages){
 const page=pdf.addPage([612,792]);
 for(const l of input.observations[0].lines){const size=Math.min(11,l.box.width*612/font.widthOfTextAtSize(l.text,1));page.drawText(l.text,{x:l.box.x*612,y:(1-l.box.y)*792-size,size,font});}
}
const buffer=Buffer.from(await pdf.save());
for(const [name,browser]of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.TEST_BROWSER||process.env.TEST_BROWSER===name)){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'smart-rate-'));
 const context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[],aiCalls=[];page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().includes('/api/reader/classify'))aiCalls.push(r.url());});
 try{
  await setupRoutes(context);await page.clock.setFixedTime(new Date('2026-10-11T05:00:00Z'));
  const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};await seed(page,state);
  await page.getByRole('button',{name:/Smart Scan/}).first().click();
  await page.locator('input[type=file][multiple]').first().setInputFiles({name:'synthetic-shipment-rate.pdf',mimeType:'application/pdf',buffer});
  await page.getByRole('button',{name:'Read document',exact:true}).click();
  await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
  const review=page.locator('.owned-reader-preview');await review.getByRole('heading',{name:'Rate confirmation · 1, 2',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'rate_confirmation');
  assert.equal(await selectedLoadFolder(page),'TEST-74123');
  assert.equal(await page.getByLabel('Document date',{exact:true}).inputValue(),'2026-10-08');
  const [download]=await Promise.all([page.waitForEvent('download'),review.getByRole('button',{name:'Export reading review',exact:true}).click()]);
  const result=JSON.parse(fs.readFileSync(await download.path(),'utf8'));fs.writeFileSync(`${output}/${name}-review.json`,JSON.stringify(result,null,2));
  assert.equal(result.engineVersion,'0.3.37');assert.equal(result.documents.length,1);
  const fields=result.documents[0].fields;
  for(const [key,value]of Object.entries({totalRate:'4250.00',loadNumber:'TEST-74123',carrier:'EXAMPLE CARRIER LLC',pickupDate:'2026-10-08',deliveryDate:'2026-10-12',pickupCity:'Albany, NY',deliveryCity:'Madison, WI'}))assert.equal(fields[key].value,value,key);
  assert.deepEqual(aiCalls,[],'clean native pages must not require the AI endpoint');
  await review.getByRole('button',{name:'$4,250.00 · Page 1',exact:true}).click();
  await page.getByRole('dialog',{name:'Check source',exact:true}).waitFor();
  await page.screenshot({path:`${output}/${name}-source.png`,fullPage:true});
  await page.getByRole('button',{name:'Confirm value',exact:true}).click();
  for(const selector of ['.ratecon-risk-ack-v10970 input','.scan-driver-check-v105 input'])if(await page.locator(selector).count())await page.locator(selector).check();
  await page.getByRole('button',{name:/^Save document$|^Save for review$/}).click();await page.locator('.scan-saved-v105').waitFor();await page.reload();
  const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('documents_local','readonly'),q=t.objectStore('documents_local').getAll();t.oncomplete=()=>{resolve(q.result.find(row=>row.extracted?.readerReviewV110345));db.close();};};}));
  assert.equal(saved.extracted.canonicalLoadNo,'TEST-74123');assert.equal(Number(saved.extracted.gross),4250);
  assert.equal(saved.extracted.origin,'Albany, NY');assert.equal(saved.extracted.destination,'Madison, WI');assert.equal(saved.extracted.carrierName,'EXAMPLE CARRIER LLC');
  const original=await page.evaluate(async clientId=>{
   const blob=await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('document_blobs','readonly'),q=t.objectStore('document_blobs').index('client_document_id').get(clientId);t.oncomplete=()=>{resolve(q.result?.blob);db.close();};t.onabort=()=>reject(t.error);};});
   return blob?Array.from(new Uint8Array(await window.__rrFixtureBlob(blob).arrayBuffer())):null;
  },saved.client_document_id);
  assert.deepEqual(Buffer.from(original||[]),buffer);assert.deepEqual(errors,[]);
  console.log(`PASS ${name}: native Shipment ID + Total + route table → local fields → save/reload with exact original, zero AI calls`);
 }catch(error){await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${name}-failure.txt`,JSON.stringify({error:String(error),errors,aiCalls,body:await page.locator('body').innerText()},null,2));throw error;}
 finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
