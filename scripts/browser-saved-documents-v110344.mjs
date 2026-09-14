import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium, webkit} from 'playwright';
import {PDFDocument} from 'pdf-lib';
import {baseState, seed, setupRoutes, simplePdf} from './v110328/browserFixture.mjs';

const output='browser-test-results/saved-documents-v110344';
fs.mkdirSync(output,{recursive:true});
const bundle=await PDFDocument.create();
for(let i=1;i<=3;i++) {
  const source=await PDFDocument.load(simplePdf(`EXAMPLE DOCUMENT ${i}\nSynthetic page ${i} of 3`));
  const [page]=await bundle.copyPages(source,[0]); bundle.addPage(page);
}
const original=Buffer.from(await bundle.save());
async function localRows(page) {
  return page.evaluate(async()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('owner-op-road-ready-offline-v1');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result, tx=db.transaction('documents_local','readonly'), rows=tx.objectStore('documents_local').getAll();
      tx.oncomplete=()=>{resolve(rows.result);db.close();};tx.onerror=()=>reject(tx.error);
    };
  }));
}
async function seedMetadata(page) {
  await page.evaluate(async()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('owner-op-road-ready-offline-v1');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result, tx=db.transaction(['documents_local','document_blobs'],'readwrite'), docs=tx.objectStore('documents_local'), rows=docs.getAll();
      rows.onsuccess=()=>{for(const row of rows.result) {
        const number=Number(row.local_id.match(/example-(\d+)/)[1]);
        docs.put({...row,load_no:'',extracted:{type:'rate_confirmation'},classification:{confidence:.95},created_at:new Date(Date.UTC(2026,8,14,8,number)).toISOString(),original_file_name:number===41?'three-page-scan.pdf':number===40?'missing-original.pdf':number===39?'cloud-original.pdf':number===0?'very-long-original-file-name-'.repeat(12)+'.pdf':'scanned-document.pdf',...(number===39?{sync_state:'synced',local_blob_state:'cloud_only',storage_path:'driver-example/wallet/cloud-original.pdf'}:{})});
      }tx.objectStore('document_blobs').delete('example-40-blob');tx.objectStore('document_blobs').delete('example-39-blob');};
      tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };
  }));
}
async function openDocuments(page) {
  await page.getByRole('button',{name:/^Documents/}).first().click();
  await page.getByRole('heading',{name:'Recent documents',exact:true}).waitFor();
}
async function fit(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const size=await locator.evaluate(element=>({width:element.clientWidth,content:element.scrollWidth,left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right,screen:innerWidth}));
  assert.ok(size.content<=size.width+1 && size.left>=-1 && size.right<=size.screen+1,JSON.stringify(size));
}

const reports=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.TEST_BROWSER||process.env.TEST_BROWSER===name)) {
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'saved-documents-'));
  const context=await type.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});
  const page=await context.newPage(), errors=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  try {
    await setupRoutes(context);
    let cloudRequests=0, cloudFailure=false;
    await context.route('**/api/documents/read-original', async route => {
      cloudRequests++;
      assert.equal(route.request().headers().authorization,'Bearer synthetic-document-token');
      assert.deepEqual(route.request().postDataJSON(),{client_document_id:'example-39-client'});
      return route.fulfill(cloudFailure?{status:503,json:{error:'unavailable'}}:{status:200,contentType:'application/pdf',body:original});
    });
    const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};
    await seed(page,state,Array.from({length:42},(_,i)=>({id:`example-${i}`,bytes:Array.from(i===41?original:simplePdf(`EXAMPLE ORIGINAL ${i}`))})));
    await seedMetadata(page);
    await page.evaluate(()=>{
      window.__reviewActions=[];window.addEventListener('road-ready-document-review-action',e=>window.__reviewActions.push(e.detail));
      Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
      Object.defineProperty(navigator,'share',{configurable:true,value:async({files})=>{
        window.__shareActive=navigator.userActivation.isActive;
        if(window.__shareCancel)throw new DOMException('Canceled','AbortError');
        window.__sharedOriginal={name:files[0].name,bytes:Array.from(new Uint8Array(await files[0].arrayBuffer()))};
      }});
    });
    await openDocuments(page);
    const before=await localRows(page), storeBefore=await page.evaluate(()=>localStorage.getItem('owner-op-road-ready-business-v1'));
    const recent=page.getByRole('region',{name:'Recent documents'});
    assert.equal(await recent.getByRole('searchbox').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)','search stays readable over the app theme');
    assert.equal(await recent.locator('li').count(),5);
    assert.match(await recent.locator('li').first().innerText(),/three-page-scan.pdf/);
    assert.match(await recent.innerText(),/42 saved/);
    assert.match(await page.locator('.load-folder-review-v10974').innerText(),/42 documents need identity review/);
    await recent.locator('.saved-document-row-v344').first().click();
    const pdfLink=recent.getByRole('link',{name:'Open PDF',exact:true});await pdfLink.waitFor();
    const popupPromise=page.waitForEvent('popup');await pdfLink.click();const popup=await popupPromise;await popup.close();
    const pdfBytes=await pdfLink.evaluate(async link=>Array.from(new Uint8Array(await(await fetch(link.href)).arrayBuffer())));
    assert.deepEqual(Buffer.from(pdfBytes),original,'Open PDF retains every original byte');
    await recent.getByRole('button',{name:'Share / Save to Files',exact:true}).click();
    await page.waitForFunction(()=>Boolean(window.__sharedOriginal));
    const shared=await page.evaluate(()=>window.__sharedOriginal);
    assert.equal(await page.evaluate(()=>window.__shareActive),true,'native share starts in the user gesture');
    assert.equal(shared.name,'three-page-scan.pdf');assert.deepEqual(Buffer.from(shared.bytes),original);
    await page.evaluate(()=>window.__shareCancel=true);
    await recent.getByRole('button',{name:'Share / Save to Files',exact:true}).click();
    await recent.getByRole('button',{name:'Share / Save to Files',exact:true}).waitFor();
    assert.equal(await recent.getByRole('alert').count(),0,'canceling the chooser is harmless');
    const downloading=page.waitForEvent('download');await recent.getByRole('link',{name:'Download',exact:true}).click();const download=await downloading;
    assert.equal(download.suggestedFilename(),'three-page-scan.pdf');
    const downloaded=fs.readFileSync(await download.path());assert.deepEqual(downloaded,original);
    assert.equal((await PDFDocument.load(downloaded)).getPageCount(),3);
    await fit(page,recent);await page.screenshot({path:`${output}/${name}-recent.png`});
    await page.getByRole('button',{name:/Show more documents/}).click();assert.equal(await recent.locator('li').count(),15);
    const search=recent.getByRole('searchbox');
    await search.fill('missing-original');await recent.locator('.saved-document-row-v344').click();
    await recent.getByRole('alert').filter({hasText:'unavailable on this device'}).waitFor();
    assert.equal(await recent.getByRole('link',{name:'Open PDF',exact:true}).count(),0,'never open the previous selection after a missing blob');
    await search.fill('three-page');await recent.locator('.saved-document-row-v344').click();await pdfLink.waitFor();
    // No native file sharing: a working download is still available.
    await recent.locator('.saved-document-row-v344').click();
    await page.evaluate(()=>Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false}));
    await recent.locator('.saved-document-row-v344').click();await pdfLink.waitFor();
    assert.equal(await recent.getByRole('button',{name:'Share / Save to Files',exact:true}).count(),0);
    await recent.getByRole('link',{name:'Download',exact:true}).waitFor();
    assert.equal(cloudRequests,0,'local originals open without a cloud request');
    await search.fill('cloud-original');
    await page.evaluate(()=>{
      window.ownerOpGetAccessToken=async()=>null;window.__shareCancel=false;
      Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
      Object.defineProperty(navigator,'onLine',{configurable:true,value:false});
    });
    await recent.locator('.saved-document-row-v344').click();
    await recent.getByRole('alert').filter({hasText:'Connect to the internet'}).waitFor();assert.equal(cloudRequests,0);
    await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,value:true}));
    await recent.getByRole('button',{name:'Try again',exact:true}).click();
    await recent.getByRole('alert').filter({hasText:'Sign in'}).waitFor();assert.equal(cloudRequests,0);
    await page.evaluate(()=>{window.ownerOpGetAccessToken=async()=>'synthetic-document-token';});
    cloudFailure=true;
    await recent.getByRole('button',{name:'Try again',exact:true}).click();
    await recent.getByRole('alert').filter({hasText:'Could not retrieve the cloud original'}).waitFor();
    cloudFailure=false;
    await recent.getByRole('button',{name:'Try again',exact:true}).click();await pdfLink.waitFor();
    assert.match(await recent.innerText(),/Original opened from cloud/);
    const cloudBytes=await pdfLink.evaluate(async link=>Array.from(new Uint8Array(await(await fetch(link.href)).arrayBuffer())));
    assert.deepEqual(Buffer.from(cloudBytes),original,'cloud-only file opens the exact original after a retry');
    await recent.getByRole('button',{name:'Share / Save to Files',exact:true}).click();
    await page.waitForFunction(()=>window.__sharedOriginal?.name==='cloud-original.pdf');
    assert.deepEqual(Buffer.from((await page.evaluate(()=>window.__sharedOriginal)).bytes),original);
    const cloudDownload=page.waitForEvent('download');await recent.getByRole('link',{name:'Download',exact:true}).click();
    assert.deepEqual(fs.readFileSync(await(await cloudDownload).path()),original);
    assert.equal(cloudRequests,2);
    assert.deepEqual(await localRows(page),before,'view/share/download leave every saved record unchanged');
    assert.equal(await page.evaluate(()=>localStorage.getItem('owner-op-road-ready-business-v1')),storeBefore);
    assert.deepEqual(await page.evaluate(()=>window.__reviewActions),[]);

    const wizard=page.locator('.load-folder-review-v10974');
    await wizard.locator(':scope>button').click();
    for(const width of [320,390,430]) {
      await page.setViewportSize({width,height:844});await fit(page,wizard);
      for(const button of await wizard.locator('.load-folder-actions-v10969 button').all())await fit(page,button);
      assert.equal(await wizard.locator('.load-folder-actions-v10969').evaluate(el=>getComputedStyle(el).position),'static');
      await fit(page,wizard.locator('article button'));await page.screenshot({path:`${output}/${name}-review-${width}.png`});
    }
    await page.reload();await page.locator('.adaptive-home-v1038').waitFor();await openDocuments(page);
    await recent.locator('.saved-document-row-v344').first().click();await pdfLink.waitFor();
    const reloaded=await pdfLink.evaluate(async link=>Array.from(new Uint8Array(await(await fetch(link.href)).arrayBuffer())));
    assert.deepEqual(Buffer.from(reloaded),original,'the same original opens after reload');
    assert.deepEqual(errors,[]);reports.push({browser:name,passed:true});
    console.log(`PASS — ${name}: 42 review documents, recent files, three-page original open/share/download, missing file, authenticated cloud-only recovery, reload and 320/390/430 layout`);
  } catch(error) {
    await page.screenshot({path:`${output}/${name}-FAILED.png`}).catch(()=>{});
    reports.push({browser:name,passed:false,error:String(error),stack:error.stack,pageErrors:errors});console.error(error);
  } finally {await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.length&&reports.every(row=>row.passed),JSON.stringify(reports));
