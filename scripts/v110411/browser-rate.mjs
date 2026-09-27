import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
import {numberedRateText} from '../../packages/smart-reader-core/test/numbered-rate-fixture.mjs';
const output='browser-test-results/document-filing-v110411';fs.mkdirSync(output,{recursive:true});
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
for(const text of numberedRateText){const page=pdf.addPage([612,842]);text.split('\n').forEach((line,i)=>page.drawText(line,{x:32,y:808-i*19,size:9,font}));}
const buffer=Buffer.from(await pdf.save());
for(const [name,browser]of [['chromium',chromium],['webkit',webkit]]){
 // Match the installed-app storage model and the other saved-document suites.
 // WebKit's ephemeral context can reject File/Blob writes to IndexedDB.
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'numbered-rate-'));
 const context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await setupRoutes(context);await page.clock.setFixedTime(new Date('2026-09-26T18:00:00Z'));
  const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};await seed(page,state);
  await page.getByRole('button',{name:/Smart Scan/}).first().click();
  await page.locator('input[type=file][multiple]').first().setInputFiles({name:'numbered-load-confirmation.pdf',mimeType:'application/pdf',buffer});
  await page.getByRole('button',{name:'Read document',exact:true}).click();
  await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
  const review=page.locator('.owned-reader-preview');
  await review.getByRole('heading',{name:'Rate confirmation · 1, 2',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'rate_confirmation');
  assert.equal(await page.getByLabel('Load folder',{exact:true}).inputValue(),'24680');
  assert.equal(await page.getByLabel('Document date',{exact:true}).inputValue(),'2026-09-24');
  assert.ok(!(await page.getByRole('region',{name:'Document reading checks',exact:true}).innerText()).includes('Agreed carrier pay was not found'),'source-supported total removes the stale missing-pay warning');
  const [download]=await Promise.all([page.waitForEvent('download'),review.getByRole('button',{name:'Export reading review',exact:true}).click()]);
  const result=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(result.engineVersion,'0.3.36');assert.equal(result.documents.length,1);assert.equal(result.documents[0].fields.totalRate.value,'1700.00');
  assert.equal(result.documents[0].fields.deliveryDate.value,'2026-09-25');assert.equal(result.documents[0].canAutoFile,false);
  for(const value of ['EXAMPLE LOGISTICS, INC.','EXAMPLE CARRIER LLC','SAMPLE WATER','SAMPLE MARKET']){
    await review.getByRole('button',{name:value+' · Page 1',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Check source',exact:true});await dialog.waitFor();
    await dialog.getByRole('button',{name:'Confirm value',exact:true}).click();await dialog.waitFor({state:'hidden'});
  }
  for(const selector of ['.ratecon-risk-ack-v10970 input','.scan-driver-check-v105 input'])if(await page.locator(selector).count())await page.locator(selector).check();
  await page.screenshot({path:`${output}/${name}-rate-review.png`,fullPage:true});
  await page.getByRole('button',{name:/^Save document$|^Save for review$/}).click();await page.locator('.scan-saved-v105').waitFor();
  await page.reload();
  const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('documents_local','readonly'),q=t.objectStore('documents_local').getAll();t.oncomplete=()=>{resolve(q.result.find(row=>row.extracted?.readerReviewV110345));db.close();};};}));
  assert.equal(saved.extracted.type,'rate_confirmation');assert.equal(saved.extracted.canonicalLoadNo,'24680');
  assert.equal(Number(saved.extracted.gross),1700);assert.equal(saved.extracted.readerReviewV110345.documents.length,1);
  assert.equal(saved.extracted.origin,'Kingfield, ME');assert.equal(saved.extracted.destination,'Rockleigh, NJ');
  assert.equal(saved.extracted.shipper,'SAMPLE WATER');assert.equal(saved.extracted.consignee,'SAMPLE MARKET');
  assert.equal(saved.extracted.broker,'EXAMPLE LOGISTICS, INC.');assert.equal(saved.extracted.carrierName,'EXAMPLE CARRIER LLC');
  const original=await page.evaluate(async clientId=>{
    const blob=await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('document_blobs','readonly'),q=t.objectStore('document_blobs').index('client_document_id').get(clientId);t.oncomplete=()=>{resolve(q.result?.blob);db.close();};t.onabort=()=>reject(t.error);};});
    return blob?Array.from(new Uint8Array(await blob.arrayBuffer())):null;
  },saved.client_document_id);
  assert.deepEqual(Buffer.from(original||[]),buffer,'Reloaded original must be byte-for-byte identical to the imported PDF');
  assert.deepEqual(saved.extracted.readerReviewV110345.documents[0].pages,[1,2]);assert.deepEqual(errors,[]);
  console.log(`PASS ${name} native two-page Load Confirmation → exact type/load/date → save and reload`);
 }catch(error){await page.screenshot({path:`${output}/${name}-rate-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${name}-rate-failure.txt`,JSON.stringify({error:String(error),errors,body:await page.locator('body').innerText()},null,2));throw error;}
 finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
