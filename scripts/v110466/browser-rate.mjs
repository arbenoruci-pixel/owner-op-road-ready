import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {rateAgreementPdf} from './fixture.mjs';
import {resolveEvidence} from '../../packages/smart-reader-core/src/index.js';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
const output='browser-test-results/signed-rate-v110466';fs.mkdirSync(output,{recursive:true});
for(const scenario of [{signed:false,certificate:false,variant:'unsigned'},{signed:true,certificate:false,variant:'signed'},{signed:true,certificate:true,variant:'signed-packet'}]){
const {signed,certificate,variant}=scenario,buffer=await rateAgreementPdf(scenario);
fs.writeFileSync(`${output}/${variant}.pdf`,buffer);
for(const [name,browser]of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.TEST_BROWSER||process.env.TEST_BROWSER===name)){
 const label=`${name}-${variant}`;
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'smart-rate-'));
 const context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[],aiCalls=[];page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().includes('/api/reader/classify'))aiCalls.push({method:r.method(),body:r.postDataJSON()});});
 try{
  await setupRoutes(context);
  if(process.env.TEST_PDFJS_DIR)await context.route('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/*',route=>{const filename=new URL(route.request().url()).pathname.split('/').at(-1);return route.fulfill({path:path.join(process.env.TEST_PDFJS_DIR,filename),contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'}});});await page.clock.setFixedTime(new Date('2026-10-11T05:00:00Z'));
  const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};await seed(page,state,[{id:'untouched',bytes:Array.from(buffer)}]);
  await page.getByRole('button',{name:/Smart Scan/}).first().click();
  await page.locator('input[type=file][multiple]').first().setInputFiles({name:`synthetic-${variant}-rate-agreement.pdf`,mimeType:'application/pdf',buffer});
  await page.getByRole('button',{name:'Read document',exact:true}).click();
  await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
  const review=page.locator('.owned-reader-preview');await review.getByRole('heading',{name:'Rate confirmation · 1, 2',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'rate_confirmation');
  assert.equal(await page.getByLabel('Load folder',{exact:true}).inputValue(),'TEST-74123');
  assert.equal(await page.getByLabel('Document date',{exact:true}).inputValue(),'2026-10-08');
  const [download]=await Promise.all([page.waitForEvent('download'),review.getByRole('button',{name:'Export reading review',exact:true}).click()]);
  const result=JSON.parse(fs.readFileSync(await download.path(),'utf8'));fs.writeFileSync(`${output}/${label}-review.json`,JSON.stringify(result,null,2));
  assert.equal(result.engineVersion,'0.3.38');
  assert.deepEqual(result.documents.map(d=>[d.kind,d.pageIds,d.role]),[['rate_confirmation',['page-1','page-2'],'primary'],...(certificate?[['signing_certificate',['page-3'],'supporting']]:[])]);
  for(const doc of result.documents)for(const field of Object.values(doc.fields))for(const c of field.candidates)for(const e of [...c.evidence,...c.labelEvidence||[],...c.continuationEvidence||[]])resolveEvidence(result,e);
  const fields=result.documents[0].fields;
  for(const [key,value]of Object.entries({totalRate:'4250.00',loadNumber:'TEST-74123',carrier:'EXAMPLE CARRIER LLC',equipment:'Van',shipper:'SAMPLE PRESS',consignee:'SAMPLE TOYS',pickupAddress:'123 Example St Albany, NY 12207',deliveryAddress:'456 Sample Rd Madison, WI 53703',pickupDate:'2026-10-08',deliveryDate:'2026-10-12',pickupCity:'Albany, NY',deliveryCity:'Madison, WI'}))assert.equal(fields[key].value,value,key);
  assert.deepEqual(aiCalls.filter(call=>!certificate||call.method==='POST'),[],'rate pages are local; a certificate may check AI availability but cannot require a paid call');
  await review.getByRole('button',{name:'$4,250.00 · Page 1',exact:true}).click();
  await page.getByRole('dialog',{name:'Check source',exact:true}).waitFor();
  await page.screenshot({path:`${output}/${label}-source.png`,fullPage:true});
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
  assert.deepEqual(Buffer.from(original||[]),buffer);assert.deepEqual(errors,[]);assert.deepEqual(aiCalls.filter(call=>!certificate||call.method==='POST'),[]);
  const retained=saved.extracted.readerReviewV110345;
  fs.writeFileSync(`${output}/${label}-saved-review.json`,JSON.stringify(retained,null,2));
  const confirmedRate=retained.documents.find(d=>d.kind==='rate_confirmation').fields.totalRate;
  assert.equal(confirmedRate.value,'4250.00');assert.equal(confirmedRate.correction.confirmed,true);
  assert.equal(confirmedRate.correction.sourceQuote,'$4,250.00');
  assert.equal(confirmedRate.correction.evidence.quote,'$4,250.00');
  const untouched=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction(['documents_local','document_blobs'],'readonly'),doc=t.objectStore('documents_local').get('untouched-local'),blob=t.objectStore('document_blobs').get('untouched-blob');t.oncomplete=async()=>{resolve({doc:doc.result,bytes:Array.from(new Uint8Array(await window.__rrFixtureBlob(blob.result.blob).arrayBuffer()))});db.close();};};}));
  assert.deepEqual(untouched.doc,{local_id:'untouched-local',client_document_id:'untouched-client',load_no:'82002',mime_type:'application/pdf',original_file_name:'untouched.pdf',type:'other',extracted:{type:'rate_confirmation',loadNo:'82002'}});
  assert.deepEqual(Buffer.from(untouched.bytes),buffer);
  console.log(`PASS ${label}: Rate Agreement → local fields → confirmed value and byte-identical original after save/reload, zero paid AI calls`);
 }catch(error){await page.screenshot({path:`${output}/${label}-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${label}-failure.txt`,JSON.stringify({error:String(error),errors,aiCalls,body:await page.locator('body').innerText()},null,2));throw error;}
 finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
}
