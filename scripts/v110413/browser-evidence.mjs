import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,simplePdf} from '../v110328/browserFixture.mjs';
const output='browser-test-results/document-evidence-v110413';fs.mkdirSync(output,{recursive:true});
const oldLoad={id:'one',loadNo:'BOL55',gross:0,origin:'Bad OCR',destination:'Unknown',pickupDate:'2026-09-24',deliveryDate:'2026-09-25',documentTransferDays:['2026-09-24']};
const loadPatch={loadNo:'L100',gross:500,origin:'Alpha, NJ',destination:'Beta, IL'};
const bytes=simplePdf('Synthetic signed delivery source\nBOL55 - Broker load L100\nReceived September 25, 2026');
const hash=createHash('sha256').update(bytes).digest('hex');
const fuelBytes=simplePdf('Synthetic fuel receipt\nTest Stop 1 Test Road, NJ\nSeptember 25, 2026 - 10 gallons diesel - USD 100');
const fuelHash=createHash('sha256').update(fuelBytes).digest('hex');
const oldDoc={local_id:'a-local',client_document_id:'a-client',type:'bol',document_type:'bol',load_no:'BOL55',document_date:'2026-09-24',sha256:hash,original_file_name:'delivery.pdf',mime_type:'application/pdf',file_size_bytes:bytes.length,extracted:{loadNo:'BOL55',documentDate:'2026-09-24'}};
const fuelFields={date:'2026-09-25',merchant:'Test Stop',sellerAddress:'1 Test Road',state:'NJ',quantity:10,volumeUnit:'gal',fuelType:'diesel',total:100,currency:'USD',vehicle:'22',purchaser:'Test Carrier',reference:'TX55',taxPaid:true,qualifiedVehicle:true};
const fuelDoc={local_id:'fuel-local',client_document_id:'fuel-client',type:'fuel_receipt',load_no:'',document_date:'2026-09-25',original_file_name:'fuel.pdf',mime_type:'application/pdf',sha256:fuelHash,extracted:fuelFields};
const original=(record,data)=>({record,original:{base64:data.toString('base64'),type:'application/pdf',size:data.length,sha256:createHash('sha256').update(data).digest('hex')}});
const recovery={format:'road-ready-evidence-recovery',version:1,id:'synthetic-recovery',summary:['Correct BOL55 to broker load L100.','Keep signed proof and original fuel source.'],coverageNote:'Synthetic evidence only.',transfer:{format:'road-ready-document-transfer',version:1,createdAt:'2026-09-27T10:00:00Z',scope:{kind:'week',weekStart:'2026-09-21'},records:{loads:[{...oldLoad,...loadPatch}],fuel:[],expenses:[],maintenance:[],settlements:[]},documents:[original(oldDoc,bytes),original(fuelDoc,fuelBytes)]},documentCorrections:[{clientId:'a-client',sha256:hash,before:{kind:'bol',loadNo:'BOL55',date:'2026-09-24'},after:{kind:'pod',fields:{date:'2026-09-25',loadNo:'L100',reference:'BOL55',podSigned:true}},proofs:[{sha256:hash,page:1,note:'Synthetic signed delivery stamp.'}]}],loadCorrections:[{id:'one',loadNo:'BOL55',before:{loadNo:'BOL55',gross:0,origin:'Bad OCR',destination:'Unknown'},after:loadPatch,proofs:[{sha256:hash,page:1,note:'Synthetic agreed load details.'}]}],aliases:[{from:'BOL55',to:'L100'}]};
// A real archived contract carries enough reader metadata to restore a live guide.
// Recovery must retain those fields without allowing that activation side effect.
const rateBytes=simplePdf('Synthetic Rate Confirmation ARCH300\nCarrier total pay USD 700\nAlpha NJ to Beta IL');
const rateHash=createHash('sha256').update(rateBytes).digest('hex');
const rateFields={date:'2026-09-25',loadNo:'ARCH300',merchant:'Archive Broker',origin:'Alpha, NJ',destination:'Beta, IL',pickupDate:'2026-09-25',deliveryDate:'2026-09-28',total:700,currency:'USD'};
const rateRecord={local_id:'rate-local',client_document_id:'rate-client',type:'rate_confirmation',canonicalLoadNo:'ARCH300',load_no:'ARCH300',document_date:'2026-09-25',status:'verified',sha256:rateHash,original_file_name:'contract.pdf',mime_type:'application/pdf',extracted:{...rateFields,broker:'',guideSourceTextV110312:'Rate confirmation ARCH300. Total carrier pay $700.',stops:[{type:'pickup',city:'Alpha',state:'NJ',date:'2026-09-25'},{type:'delivery',city:'Beta',state:'IL',date:'2026-09-28'}]}};
recovery.transfer.documents.push(original(rateRecord,rateBytes));
recovery.documentCorrections.push({clientId:'rate-client',sha256:rateHash,before:{kind:'rate_confirmation',loadNo:'ARCH300',date:'2026-09-25'},after:{kind:'rate_confirmation',fields:rateFields},proofs:[{sha256:rateHash,page:1,note:'Synthetic complete source contract.'}]});
async function stored(page){return page.evaluate(async()=>{
 const db=await new Promise((ok,no)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
 const get=name=>new Promise((ok,no)=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
 const docs=await get('documents_local'),blobs=await get('document_blobs'),states=await get('app_snapshots');db.close();
 return {docs,blobs:await Promise.all(blobs.map(async b=>({id:b.client_document_id,bytes:[...new Uint8Array(await b.blob.arrayBuffer())]}))),state:states.find(s=>s.key==='owner-op-road-ready-state-v1')?.state,business:JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1'))};
});}
const logs=s=>JSON.stringify({events:s.eventsByDay,team:s.teamLogbooksByDriverId,signature:s.signatureByDay,forms:s.formByDay,inspection:s.inspectionByDay,loadInfo:s.loadInfo});
async function chooseRecovery(page,payload=recovery){
 const panel=page.getByLabel('Reviewed recovery',{exact:true});
 const [chooser]=await Promise.all([page.waitForEvent('filechooser'),panel.getByRole('button',{name:'Import reviewed recovery',exact:true}).click()]);
 await chooser.setFiles({name:'reviewed-recovery.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
 await panel.getByLabel('Review recovery',{exact:true}).waitFor();
}
async function openEvidence(page){await page.getByRole('button',{name:/^Documents/}).first().click();await page.locator('.rr-docs-browser').waitFor();await page.getByRole('button',{name:'More document options',exact:true}).click();const panel=page.getByRole('region',{name:'More document options',exact:true});await panel.getByLabel('Document evidence checklist',{exact:true}).locator('summary').first().click();return panel;}
for(const [name,browser] of [['chromium',chromium],['webkit',webkit]]){
 if(process.env.TEST_BROWSERS&&!process.env.TEST_BROWSERS.split(',').includes(name))continue;
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rr-evidence-')),context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,acceptDownloads:true,serviceWorkers:'block'});
 let page;
 try{
  await setupRoutes(context);page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',error=>{throw error;});await page.clock.setFixedTime(new Date('2026-09-27T15:00:00Z'));
  const state=baseState();state.view='logbook';state.testInstructionStore={loads:[oldLoad],documents:[],fuel:[],expenses:[]};await seed(page,state,[{id:'a',bytes:[...bytes]}]);
  await page.evaluate(async doc=>{const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});await new Promise((ok,no)=>{const tx=db.transaction('documents_local','readwrite');tx.objectStore('documents_local').put(doc);tx.oncomplete=ok;tx.onerror=()=>no(tx.error);});db.close();},oldDoc);
  let panel=await openEvidence(page);const before=await stored(page);
  await chooseRecovery(page);await page.getByRole('button',{name:'Cancel recovery',exact:true}).click();assert.deepEqual((await stored(page)).business,before.business);
  // Correction and new originals must roll back together on quota failure.
  await chooseRecovery(page);await page.evaluate(()=>{window.savedEvidenceSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='owner-op-road-ready-business-v1')throw new DOMException('Synthetic quota','QuotaExceededError');return window.savedEvidenceSetItem.call(this,k,v);};});
  await page.getByRole('button',{name:'Apply reviewed recovery',exact:true}).click();await page.getByRole('alert').filter({hasText:'Recovery stopped:'}).waitFor();
  await page.evaluate(()=>{Storage.prototype.setItem=window.savedEvidenceSetItem;});let after=await stored(page);assert.deepEqual(after.docs,before.docs);assert.deepEqual(after.business,before.business);assert.equal(after.blobs.length,1);
  // A newer load edit is protected even before the source transaction starts.
  await page.evaluate(()=>{const k='owner-op-road-ready-business-v1',s=JSON.parse(localStorage.getItem(k));s.loads[0].gross=777;localStorage.setItem(k,JSON.stringify(s));});
  await page.getByRole('button',{name:'Apply reviewed recovery',exact:true}).click();await page.getByRole('alert').filter({hasText:'gross changed'}).waitFor();assert.equal((await stored(page)).docs.length,1);
  await page.evaluate(()=>{const k='owner-op-road-ready-business-v1',s=JSON.parse(localStorage.getItem(k));s.loads[0].gross=0;localStorage.setItem(k,JSON.stringify(s));});
  await chooseRecovery(page);
  await page.getByRole('button',{name:'Apply reviewed recovery',exact:true}).click();await page.getByRole('status').filter({hasText:'Recovered 2 originals'}).waitFor();
  await page.waitForTimeout(500);after=await stored(page);assert.equal(after.docs.length,3);assert.equal(after.docs.find(d=>d.client_document_id==='a-client').type,'pod');assert.equal(after.business.loads.length,1);assert.equal(after.business.loads[0].loadNo,'L100');assert.equal(after.business.loads[0].gross,500);assert.equal(logs(after.state),logs(before.state));assert.deepEqual(after.blobs.find(b=>b.id==='a-client').bytes,[...bytes]);
  await panel.getByRole('button',{name:'Choose saved document',exact:true}).click();await panel.getByLabel('Choose saved source',{exact:true}).selectOption('fuel-client');
  const review=page.getByLabel('Review document evidence',{exact:true});await review.getByLabel('Tax-paid motor fuel checked',{exact:true}).check();await review.getByLabel('Fueled the qualified truck',{exact:true}).check();
  await page.evaluate(()=>{const k='road-ready-owner-ops-v102';window.evidenceOwnerBefore=localStorage.getItem(k);localStorage.setItem(k,JSON.stringify({fuelImports:[{id:'csv-fuel',date:'2026-09-25',transactionId:'TX55',state:'NJ',total:100,gallons:10}]}));});
  await review.getByRole('button',{name:'Save and use in books',exact:true}).click();await panel.getByRole('alert').filter({hasText:'may already exist'}).waitFor();assert.equal((await stored(page)).business.fuel.length,0);
  await page.evaluate(()=>{const k='road-ready-owner-ops-v102';if(window.evidenceOwnerBefore===null)localStorage.removeItem(k);else localStorage.setItem(k,window.evidenceOwnerBefore);});
  await review.getByRole('button',{name:'Save and use in books',exact:true}).click();await panel.getByRole('status').filter({hasText:'Reviewed source and book entry saved'}).waitFor();
  after=await stored(page);assert.equal(after.business.fuel.length,1);assert.equal(after.business.fuel[0].iftaEligible,true);assert.equal(after.business.fuel[0].gallons,10);assert.equal(after.business.fuel[0].sourceDocumentHash,fuelHash);
  await review.getByRole('button',{name:'Save and use in books',exact:true}).click();assert.equal((await stored(page)).business.fuel.length,1,'re-saving the source cannot duplicate an expense');
  await review.getByRole('button',{name:'Close review',exact:true}).click();await panel.getByRole('button',{name:'Track a load',exact:true}).click();
  const expected=page.getByRole('form',{name:'Track expected load',exact:true});await expected.getByLabel('Broker load number',{exact:true}).fill('FUTURE200');await expected.getByLabel('Pickup date',{exact:true}).fill('2026-09-27');await expected.getByLabel('Delivery date',{exact:true}).fill('2026-09-28');await expected.getByRole('button',{name:'Save expectation'}).click();
  await panel.locator('li').filter({hasText:'Load FUTURE200 · Signed delivery proof'}).getByText('Not due yet',{exact:true}).waitFor();
  // Weekly add routes preserve the intended load through scanner review.
  const rateRow=panel.locator('li').filter({hasText:'Load FUTURE200 · Rate confirmation'});await rateRow.getByRole('button',{name:'Add document',exact:true}).click();await page.getByRole('button',{name:'Choose a file',exact:false}).waitFor();
  await page.reload();panel=await openEvidence(page);
  await chooseRecovery(page);await page.getByRole('button',{name:'Apply reviewed recovery',exact:true}).click();await page.getByRole('status').filter({hasText:'already applied'}).waitFor();after=await stored(page);assert.equal(after.business.fuel.length,1);assert.equal(after.business.loads.length,2);assert.equal(after.docs.find(d=>d.client_document_id==='fuel-client').extracted.evidenceFactsV1.source,'driver_review');assert.equal(logs(after.state),logs(before.state));
  for(const width of [320,390,820]){await page.setViewportSize({width,height:1000});assert.ok(await panel.evaluate(el=>el.getBoundingClientRect().right<=innerWidth+1),'checklist fits mobile viewport');}
  await page.screenshot({path:`${output}/${name}-evidence.png`,fullPage:true});
  await page.getByRole('button',{name:'IFTA',exact:true}).first().click();await page.getByLabel('Document evidence checklist',{exact:true}).waitFor();
  console.log(`PASS ${name} — recovery preview, conflict guard, quota rollback, original bytes, one-source fuel bookkeeping, future requirements, repeat imports, unchanged duty logs and 320/390/820px`);
 }catch(error){if(page){await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${name}-failure.txt`,await page.locator('body').innerText().catch(()=>''));}throw error;}
 finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
