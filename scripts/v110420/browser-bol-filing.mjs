import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,simplePdf} from '../v110328/browserFixture.mjs';
const output='browser-test-results/bol-filing-v110420';fs.mkdirSync(output,{recursive:true});
const fields={date:'2026-09-25',loadNo:'LOAD300',reference:'BOL55',origin:'Alpha, NJ',destination:'Beta, IL'};
function original(id,loadNo,bytes,reviewed=false){
 const hash=createHash('sha256').update(bytes).digest('hex');
 return {record:{local_id:id+'-local',client_document_id:id+'-client',type:'bol',document_type:'bol',load_no:loadNo,document_date:fields.date,sha256:hash,mime_type:'application/pdf',original_file_name:id+'.pdf',extracted:{loadNo,bolNo:'bol55',origin:reviewed?fields.origin:'to be not',...(reviewed?{evidenceFactsV1:{version:1,source:'source_recovery',sourceSha256:hash,reviewedAt:'2026-09-27T10:00:00Z',fields,components:[]}}:{})}},original:{base64:bytes.toString('base64'),sha256:hash,size:bytes.length,type:'application/pdf'}};
}
let transfer={format:'road-ready-document-transfer',version:1,createdAt:'2026-09-27T12:00:00Z',scope:{kind:'week',weekStart:'2026-09-21'},records:{loads:[
 {loadNo:'LOAD100',pickupDate:'2026-09-23',deliveryDate:'2026-09-24',origin:'West, IL',destination:'East, ME',gross:700,notes:'Route discrepancy: compare the original addresses.'},
 {loadNo:'LOAD300',pickupDate:fields.date,deliveryDate:'2026-09-28',origin:fields.origin,destination:fields.destination,gross:500},
 {loadNo:'PRIOR500',pickupDate:'2026-09-14'}],fuel:[],expenses:[],maintenance:[],settlements:[]},documents:[original('rescan','LOAD100',simplePdf('Re-scanned BOL55, September 25, Alpha NJ to Beta IL')),original('reviewed','LOAD300',simplePdf('Previously saved BOL55, September 25, Alpha NJ to Beta IL'),true)]};
let correction={clientId:transfer.documents[0].record.client_document_id,sha256:transfer.documents[0].original.sha256,before:{kind:'bol',loadNo:'LOAD100',date:fields.date},after:{kind:'bol',fields,reviewed:true},proofs:[{sha256:transfer.documents[0].original.sha256,page:1,note:'Synthetic re-scanned pickup BOL.'}]};
let recovery={format:'road-ready-evidence-recovery',version:1,id:'synthetic-rescan-fix',summary:['Correct one re-scanned BOL.'],coverageNote:'Synthetic source review.',transfer:{...transfer,records:{loads:[],fuel:[],expenses:[],maintenance:[],settlements:[]},documents:[transfer.documents[0]]},documentCorrections:[correction],loadCorrections:[],aliases:[]};
// Optional private replay stays outside source control and outside CI artifacts.
if(process.env.PRIVATE_TRANSFER&&process.env.PRIVATE_RECOVERY){transfer=JSON.parse(fs.readFileSync(process.env.PRIVATE_TRANSFER));recovery=JSON.parse(fs.readFileSync(process.env.PRIVATE_RECOVERY));correction=recovery.documentCorrections[0];}
const target=correction.after.fields.loadNo,previous=correction.before.loadNo,reference=correction.after.fields.reference;
async function stored(page){return page.evaluate(async()=>{
 const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});
 const get=name=>new Promise(ok=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>ok(r.result);});
 const docs=await get('documents_local'),blobs=await get('document_blobs'),states=await get('app_snapshots');db.close();
 const state=states.find(s=>s.key==='owner-op-road-ready-state-v1')?.state||{};
 const sha=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(n=>n.toString(16).padStart(2,'0')).join('');
 return {docs,blobs:await Promise.all(blobs.map(async b=>({id:b.client_document_id,hash:await sha(b.blob)}))),business:JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')),logs:Object.fromEntries(['eventsByDay','routeLegsByDay','signatureByDay','formByDay','loadInfo'].map(k=>[k,state[k]]))};
});}
for(const [name,browser] of [['chromium',chromium],['webkit',webkit]]){
 if(process.env.TEST_BROWSERS&&!process.env.TEST_BROWSERS.split(',').includes(name))continue;
 for(const mode of ['review','recovery']){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rr-bol-filing-'));
  const context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
  let page;const errors=[];
  try{
   await setupRoutes(context);page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-09-27T15:00:00Z'));
   const state=baseState();state.view='logbook';state.testInstructionStore={...transfer.records,documents:[]};await seed(page,state);
   await page.evaluate(async items=>{const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});await new Promise((ok,no)=>{const tx=db.transaction(['documents_local','document_blobs'],'readwrite');for(const item of items){const doc=item.record;tx.objectStore('documents_local').put(doc);tx.objectStore('document_blobs').put({local_blob_id:'blob-'+doc.client_document_id,client_document_id:doc.client_document_id,blob:new Blob([Uint8Array.from(atob(item.original.base64),c=>c.charCodeAt(0))],{type:item.original.type})});}tx.oncomplete=ok;tx.onerror=()=>no(tx.error);});db.close();},transfer.documents);
   await page.reload();await page.getByRole('button',{name:/^Documents/}).first().click();await page.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Loads',exact:true}).click();
   const docs=page.getByRole('region',{name:'Documents',exact:true});await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).waitFor();
   const before=await stored(page),weeks=await docs.locator('.rr-docs-card').allTextContents();
   await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).click();await docs.locator('.rr-docs-card').filter({hasText:'Load '+previous}).click();
   await docs.locator('.rr-driver-check-toggle').click();await docs.getByText(`BOL ${reference} matches another load`,{exact:true}).waitFor();
   assert.equal(await docs.getByText('Source details need review',{exact:true}).count(),0);
   if(mode==='review'){
    await docs.getByRole('button',{name:'Review match',exact:true}).click();const review=docs.getByRole('region',{name:'Review document evidence',exact:true});
    assert.equal(await review.getByLabel('Broker load number',{exact:true}).inputValue(),target);
    assert.equal(await review.getByLabel('BOL reference',{exact:true}).inputValue(),reference);
    assert.equal(await review.getByLabel('Pickup location',{exact:true}).inputValue(),correction.after.fields.origin);
    assert.deepEqual(await stored(page),before,'viewing a suggestion cannot file or mark a re-scan reviewed');
    const download=review.getByRole('link',{name:'Download',exact:true});await download.waitFor();const bytes=await download.evaluate(async el=>Array.from(new Uint8Array(await(await fetch(el.href)).arrayBuffer())));
    assert.equal(createHash('sha256').update(Buffer.from(bytes)).digest('hex'),correction.sha256);
    await page.screenshot({path:`${output}/${name}-${mode}.png`,fullPage:true});
    await review.getByRole('button',{name:'Save to Load '+target,exact:true}).click();
    await docs.getByRole('status').filter({hasText:'Saved to Load '+target}).waitFor();
   }else{
    await docs.getByRole('button',{name:'More document options',exact:true}).click();const panel=docs.getByLabel('Reviewed recovery',{exact:true});
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),panel.getByRole('button',{name:'Import reviewed recovery',exact:true}).click()]);
    await chooser.setFiles({name:'reviewed-correction.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(recovery))});
    await panel.getByLabel('Review recovery',{exact:true}).waitFor();assert.equal(await panel.getByLabel('Recovery differences',{exact:true}).count(),0);
    await panel.getByRole('button',{name:'Apply reviewed recovery',exact:true}).click();await panel.getByRole('status').filter({hasText:'reviewed 1 document records'}).waitFor();
   }
   const after=await stored(page),changed=after.docs.find(d=>d.client_document_id===correction.clientId);
   assert.equal(changed.load_no,target);assert.equal(changed.sha256,correction.sha256);assert.equal(changed.extracted.evidenceFactsV1.fields.origin,correction.after.fields.origin);
   assert.equal(after.docs.length,before.docs.length);assert.deepEqual(after.blobs,before.blobs);assert.deepEqual(after.logs,before.logs);assert.deepEqual(after.business.loads,before.business.loads);
   for(const d of before.docs.filter(d=>d.client_document_id!==correction.clientId))assert.deepEqual(after.docs.find(x=>x.local_id===d.local_id),d,'unrelated and previously reviewed originals stay unchanged');
   await page.reload();await page.getByRole('button',{name:/^Documents/}).first().click();await page.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Loads',exact:true}).click();await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).waitFor();
   assert.equal((await docs.locator('.rr-docs-card').allTextContents()).length,weeks.length,'filing keeps the same service weeks');
   await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).click();await docs.locator('.rr-docs-card').filter({hasText:'Load '+previous}).click();
   if(await docs.locator('.rr-driver-check-toggle').count())await docs.locator('.rr-driver-check-toggle').click();
   assert.equal(await docs.getByRole('button',{name:'Review match',exact:true}).count(),0);assert.equal(await docs.getByText('Source details need review',{exact:true}).count(),0);
   await docs.getByRole('button',{name:'Back to loads',exact:true}).click();await docs.locator('.rr-docs-card').filter({hasText:'Load '+target}).click();
   await docs.getByRole('button',{name:'More document options',exact:true}).click();const tools=docs.getByRole('region',{name:'More document options',exact:true});
   await tools.getByRole('button',{name:'Export load',exact:true}).click();const link=tools.getByRole('link',{name:'Download transfer',exact:true});await link.waitFor();const exported=await link.evaluate(async el=>(await fetch(el.href)).json());
   const added=exported.documents.find(i=>i.record.client_document_id===correction.clientId);assert.equal(added.record.load_no,target);assert.equal(added.original.sha256,correction.sha256);
   assert.equal(createHash('sha256').update(Buffer.from(added.original.base64,'base64')).digest('hex'),correction.sha256);
   for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.ok(await docs.evaluate(el=>el.scrollWidth<=el.clientWidth+1));}
   assert.deepEqual(errors,[]);console.log(`PASS ${name} ${mode} — corrected one re-scan, preserved every original and other record, reload, weekly filing and export verified`);
  }catch(error){if(page){await page.screenshot({path:`${output}/${name}-${mode}-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${name}-${mode}-failure.txt`,await page.locator('body').innerText().catch(()=>''));}throw error;}
  finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
 }
}
