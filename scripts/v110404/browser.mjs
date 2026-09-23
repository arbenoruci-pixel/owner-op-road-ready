import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,simplePdf,snapshot,protectedData} from '../v110328/browserFixture.mjs';

const output='browser-test-results/simple-documents-v110404';
fs.mkdirSync(output,{recursive:true});
const documents=[
  {id:'rate',type:'rate_confirmation',file:'rate-confirmation.pdf'},
  {id:'pickup',type:'bol',file:'pickup-bill-of-lading.pdf'},
  {id:'delivery-one',type:'pod',file:'signed-bill-of-lading-first-stop.pdf',stop:1},
  {id:'delivery-two',type:'pod',file:'signed-bill-of-lading-second-stop.pdf',stop:2},
  {id:'lumper',type:'lumper_receipt',file:'unloading-receipt.pdf'},
  {id:'fuel',type:'fuel_receipt',file:'diesel-receipt-with-a-very-long-original-filename-'.repeat(4)+'.pdf'},
  {id:'missing',type:'other',file:'unavailable-original.pdf'},
];
const original=Object.fromEntries(documents.map(d=>[d.id,simplePdf('SYNTHETIC ORIGINAL '+d.id)]));
const reports=[];
async function records(page){return page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result,tx=db.transaction('documents_local','readonly'),read=tx.objectStore('documents_local').getAll();tx.oncomplete=()=>{db.close();resolve(read.result);};tx.onerror=()=>reject(tx.error);};
}));}
async function fits(page,locator){
  const boxes=await locator.evaluateAll(elements=>elements.map(el=>({text:el.textContent.slice(0,60),width:el.clientWidth,content:el.scrollWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,screen:innerWidth})));
  for(const box of boxes)assert.ok(box.content<=box.width+1&&box.left>=-1&&box.right<=box.screen+1,JSON.stringify(box));
}
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  try{
    await setupRoutes(context);
    const state=baseState();state.view='logbook';state.testInstructionStore={loads:[{id:'load-38324346',loadNo:'38324346',origin:'Windsor, CT',destination:'Coldwater, MI',broker:'Total Quality Logistics (TQL)',pickupDate:'2026-09-14',deliveryDate:'2026-09-15',stops:[{type:'delivery',sequence:1,company:'First receiver'},{type:'delivery',sequence:2,company:'Second receiver'}]},{id:'amazon',loadNo:'2581',broker:'Amazon Relay',pickupDate:'2026-09-14'}],documents:[]};
    state.eventsByDay['2026-09-14']=[{id:'pickup-first',status:'ON',startMin:480,endMin:510,loadNo:'38324346',city:'Windsor',state:'CT',note:'Pickup',source:'manual'},{id:'pickup-amazon',status:'ON',startMin:600,endMin:630,loadNo:'2581',note:'Pickup',source:'manual'}];
    await seed(page,state,documents.map(d=>({id:d.id,bytes:Array.from(original[d.id])})));
    await page.evaluate(docs=>new Promise((resolve,reject)=>{
      const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result,tx=db.transaction(['documents_local','document_blobs'],'readwrite');
        for(const doc of docs)tx.objectStore('documents_local').put({local_id:doc.id+'-local',client_document_id:doc.id+'-client',load_no:'38324346',document_type:doc.type,type:doc.type,document_date:'2026-09-15',mime_type:'application/pdf',original_file_name:doc.file,created_at:'2026-09-23T01:00:00Z',stopSequence:doc.stop||0,extracted:{type:doc.type,loadNo:'38324346',documentDate:'2026-09-15'}});
        tx.objectStore('document_blobs').delete('missing-blob');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
      };
    }),documents);
    await page.reload();await page.locator('.adaptive-home-v1038').waitFor();
    const before=await records(page),businessBefore=await page.evaluate(()=>localStorage.getItem('owner-op-road-ready-business-v1')),protectedBefore=protectedData(await snapshot(page));
    await page.getByRole('button',{name:/^Documents/}).first().click();
    const docs=page.getByRole('region',{name:'Documents',exact:true});
    await docs.getByRole('heading',{name:'Documents',exact:true}).waitFor();
    await docs.getByRole('button',{name:/Sep 14.*Sep 20, 2026/}).waitFor();
    assert.equal(await docs.getByRole('region',{name:'Recent documents'}).count(),0,'weeks are the starting view');
    assert.equal(await docs.locator('.rr-docs-card').count(),1,'the import date does not add a second week');
    for(const width of [320,390,430]){
      await page.setViewportSize({width,height:844});
      await fits(page,docs);await fits(page,docs.locator('.rr-docs-card'));
      await page.screenshot({path:`${output}/${name}-weeks-${width}.png`});
      await docs.getByRole('button',{name:/Sep 14.*Sep 20, 2026/}).click();
      await docs.getByRole('heading',{name:/Sep 14.*Sep 20, 2026/}).waitFor();
      assert.equal(await docs.locator('.rr-docs-card').count(),2);
      await fits(page,docs.locator('.rr-docs-card'));
      await page.screenshot({path:`${output}/${name}-loads-${width}.png`});
      await docs.getByRole('button',{name:/Load 38324346/}).click();
      await docs.getByRole('heading',{name:'Load 38324346',exact:true}).waitFor();
      assert.equal(await docs.locator('.rr-docs-file').count(),7);
      assert.equal(await docs.getByRole('region',{name:'Proof of delivery',exact:true}).locator('.rr-docs-file').count(),2);
      assert.match(await docs.innerText(),/POD · Stop 1/);assert.match(await docs.innerText(),/POD · Stop 2/);
      const advanced=docs.locator('details').filter({has:page.getByText('Load details & other records',{exact:true})}).first();
      assert.equal(await advanced.getAttribute('open'),null,'operational details start collapsed');
      await fits(page,docs);await fits(page,docs.locator('.rr-docs-file'));
      const colors=await docs.locator('.rr-docs-file-copy strong').first().evaluate(el=>({ink:getComputedStyle(el).color,paper:getComputedStyle(el.closest('button')).backgroundColor}));
      assert.equal(colors.ink,'rgb(22, 44, 72)');assert.equal(colors.paper,'rgb(255, 255, 255)');
      await page.screenshot({path:`${output}/${name}-documents-${width}.png`});
      await docs.getByRole('button',{name:'‹ Back to loads',exact:true}).click();
      await docs.getByRole('button',{name:'‹ Back to weeks',exact:true}).click();
    }
    await docs.getByRole('button',{name:/Sep 14.*Sep 20, 2026/}).click();
    await docs.getByRole('button',{name:/Load 38324346/}).click();
    await page.evaluate(()=>{const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{const url=create(blob);window.__lastDocumentUrl=url;return url;};});
    const opening=page.waitForEvent('popup');
    await docs.getByRole('button',{name:/^Open POD · Stop 2/}).click();const opened=await opening;
    await page.waitForFunction(()=>Boolean(window.__lastDocumentUrl));
    const openedBytes=await page.evaluate(async()=>Array.from(new Uint8Array(await(await fetch(window.__lastDocumentUrl)).arrayBuffer())));
    assert.deepEqual(Buffer.from(openedBytes),original['delivery-two'],'one tap opens the selected stop’s exact original');
    await opened.close();
    await docs.getByRole('button',{name:/^Open File .*unavailable-original/}).click();
    await docs.getByRole('alert').filter({hasText:'This original could not be opened'}).waitFor();
    await docs.getByRole('button',{name:'Weeks',exact:true}).click();
    await docs.getByRole('button',{name:'Browse all saved files',exact:true}).click();
    await docs.getByRole('heading',{name:'Recent documents',exact:true}).waitFor();
    assert.deepEqual(await records(page),before,'browsing does not change imported records');
    assert.equal(await page.evaluate(()=>localStorage.getItem('owner-op-road-ready-business-v1')),businessBefore);
    assert.deepEqual(protectedData(await snapshot(page)),protectedBefore,'document browsing preserves logbook data');
    assert.deepEqual(errors,[]);reports.push({browser:name,passed:true,widths:[320,390,430],exactOriginal:true});
  }catch(error){await page.screenshot({path:`${output}/${name}-failure.png`}).catch(()=>{});fs.writeFileSync(`${output}/${name}-failure.json`,JSON.stringify({error:error.stack,pageErrors:errors,body:await page.locator('body').innerText()},null,2));throw error;}
  finally{await browser.close();}
}
fs.writeFileSync(`${output}/report.json`,JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
