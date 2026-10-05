import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,simplePdf} from '../v110328/browserFixture.mjs';

const output='browser-test-results/document-weeks-v110416';fs.mkdirSync(output,{recursive:true});
const bytes=simplePdf('Synthetic reviewed load source'),hash=createHash('sha256').update(bytes).digest('hex');
const names=['A','B','C','D','E'];
const loads=names.map((n,i)=>({id:'transfer-load-BOL'+n,loadNo:'LOAD'+n,broker:'Example '+n,origin:'Alpha, IL',destination:'Beta, IN',pickupDate:'2026-09-25',deliveryDate:i?'2026-09-25':'2026-09-28',documentWorkflowStage:i?'delivered':'picked_up',documentTransferDays:i?['2026-09-25']:['2026-09-25','2026-09-28']}));
loads.push({id:'prior',loadNo:'PRIOR100',broker:'Earlier service',documentWorkflowStage:'tonu',documentTransferDays:['2026-09-14']});
const documents=names.map(n=>({local_id:'doc'+n+'-local',client_document_id:'doc'+n+'-client',load_no:'LOAD'+n,type:'bol',document_type:'bol',document_date:'2026-09-25',original_file_name:'synthetic-'+n+'.pdf',mime_type:'application/pdf',file_size_bytes:bytes.length,sha256:hash,
  extracted:{evidenceFactsV1:{version:1,source:'source_recovery',sourceSha256:hash,reviewedAt:'2026-09-27',fields:{loadNo:'LOAD'+n,date:'2026-09-25',origin:'Alpha, IL',destination:'Beta, IN'}}},
  auditTrail:[{action:'evidence_review',source:'source_recovery',before:{loadNo:'BOL'+n},after:{loadNo:'LOAD'+n}}]}));
documents.push({local_id:'prior-local',client_document_id:'prior-client',load_no:'PRIOR100',type:'invoice',document_type:'invoice',document_date:'2026-09-25',original_file_name:'synthetic-prior-invoice.pdf',mime_type:'application/pdf',sha256:hash,file_size_bytes:bytes.length});
async function persisted(page){return page.evaluate(async()=>{
  const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});
  const get=name=>new Promise(ok=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>ok(r.result);});
  const docs=await get('documents_local'),blobs=await get('document_blobs'),states=await get('app_snapshots');db.close();
  const state=states.find(s=>s.key==='owner-op-road-ready-state-v1')?.state||{};
  const logs=Object.fromEntries(['eventsByDay','signatureByDay','certifyStatus','inspectionByDay','formByDay','routeLegsByDay'].map(k=>[k,state[k]]));
  return {business:localStorage.getItem('owner-op-road-ready-business-v1'),docs,logs,originals:await Promise.all(blobs.map(async b=>({id:b.client_document_id,bytes:[...new Uint8Array(await b.blob.arrayBuffer())]})))};
});}
for(const [name,browser] of [['chromium',chromium],['webkit',webkit]]){
  if(process.env.TEST_BROWSERS&&!process.env.TEST_BROWSERS.split(',').includes(name))continue;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rr-weeks-'));
  const context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,acceptDownloads:true,serviceWorkers:'block',colorScheme:'dark'});
  let page;const errors=[];
  try{
    await setupRoutes(context);page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-09-27T15:00:00Z'));
    const state=baseState();state.view='logbook';state.testInstructionStore={loads,documents:[],fuel:[],expenses:[]};
    state.routeLegsByDay['2026-09-25']=names.map(n=>({id:'legacy-'+n,loadNo:'BOL'+n,shippingDocs:'BOL'+n,date:'2026-09-25',fromCity:'Alpha',fromState:'IL',toCity:'Beta',toState:'IN',kind:'loaded',status:'closed'}));
    await seed(page,state,documents.map(d=>({id:d.local_id.replace('-local',''),bytes:[...bytes]})));
    await page.evaluate(async docs=>{const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});await new Promise((ok,no)=>{const tx=db.transaction('documents_local','readwrite');for(const doc of docs)tx.objectStore('documents_local').put(doc);tx.oncomplete=ok;tx.onerror=()=>no(tx.error);});db.close();},documents);
    await page.reload();await page.getByRole('button',{name:/^Documents/}).first().click();await page.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Loads',exact:true}).click();
    let docs=page.getByRole('region',{name:'Documents',exact:true});await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).waitFor();
    const before=await persisted(page);
    for(let attempt=0;attempt<2;attempt++){
      assert.equal(await docs.locator('.rr-docs-card').filter({hasText:'Sep 28'}).count(),0,'planned delivery does not create an extra week');
      await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).getByText('5 loads · 5 documents',{exact:true}).waitFor();
      await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).click();await docs.getByRole('heading',{name:'Loads this week',exact:true}).waitFor();
      assert.equal(await docs.locator('.rr-docs-card').count(),5);
      assert.equal(await docs.locator('.rr-docs-card').filter({hasText:/Load BOL/}).count(),0,'reviewed aliases do not reappear as empty folders');
      await docs.getByRole('navigation',{name:'Choose week'}).getByText('Sep 21 – Sep 27, 2026',{exact:true}).waitFor();
      assert.equal(await docs.locator('.rr-driver-card-date').getByText('Sep 25',{exact:true}).count(),5);
      const search=docs.getByRole('searchbox');await search.fill('LOADA');assert.equal(await docs.locator('.rr-docs-card').count(),1);await search.fill('');
      const color=await search.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));assert.deepEqual(color,{background:'rgb(255, 255, 255)',color:'rgb(21, 43, 70)'},'search stays readable in iOS dark mode');
      for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.ok(await docs.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'no horizontal overflow');}
      await page.screenshot({path:`${output}/${name}-week.png`,fullPage:true});
      await docs.locator('.rr-docs-card').filter({hasText:'Load LOADA'}).click();await docs.getByRole('button',{name:'Sep 21 – Sep 27, 2026 ›',exact:true}).waitFor();
      await docs.getByRole('button',{name:'Back to loads',exact:true}).click();await docs.getByRole('button',{name:'Previous saved week',exact:true}).click();
      assert.equal(await docs.locator('.rr-docs-card').count(),1);await docs.locator('.rr-docs-card').filter({hasText:'Load PRIOR100'}).waitFor();
      await docs.getByRole('button',{name:'Next saved week',exact:true}).click();assert.equal(await docs.locator('.rr-docs-card').count(),5);
      await docs.getByRole('button',{name:'Back to weeks',exact:true}).click();
      if(!attempt){await page.reload();await page.getByRole('button',{name:/^Documents/}).first().click();await page.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Loads',exact:true}).click();docs=page.getByRole('region',{name:'Documents',exact:true});await docs.locator('.rr-docs-card').filter({hasText:'Sep 21'}).waitFor();}
    }
    assert.deepEqual(await persisted(page),before,'filing and navigation never change originals or business rows');
    assert.deepEqual(errors,[]);
    console.log(`PASS ${name} — reviewed legacy refs, separate service weeks, reload, week navigation, dates, dark-mode search, 320/390px and unchanged originals/logs`);
  }catch(error){if(page){await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${name}-failure.txt`,await page.locator('body').innerText().catch(()=>''));}throw error;}
  finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
