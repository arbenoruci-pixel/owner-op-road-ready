import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,simplePdf} from '../v110328/browserFixture.mjs';
const output='browser-test-results/simple-documents-v110404/attachment-scanner';
fs.mkdirSync(output,{recursive:true});
const reports=[];
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{
 const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);
 request.onsuccess=()=>{const db=request.result,tx=db.transaction(['documents_local','document_blobs','capture_asset_blobs','app_snapshots'],'readonly');
 const docs=tx.objectStore('documents_local').getAll(),blobs=tx.objectStore('document_blobs').getAll(),assets=tx.objectStore('capture_asset_blobs').getAll(),state=tx.objectStore('app_snapshots').get('owner-op-road-ready-state-v1');
 tx.oncomplete=async()=>{db.close();try{resolve({docs:docs.result,blobs:await Promise.all(blobs.result.map(async row=>{const blob=row.blob||row.processed_blob||row.original_blob;return {id:row.local_blob_id,bytes:blob?Array.from(new Uint8Array(await blob.arrayBuffer())):null};})),assets:await Promise.all(assets.result.map(async row=>({variants:row.variants,clientDocumentId:row.client_document_id,bytes:row.blob?Array.from(new Uint8Array(await row.blob.arrayBuffer())):null}))),state:state.result?.state});}catch(error){reject(error);}};tx.onerror=()=>reject(tx.error);};
}));}
const protectedData=state=>Object.fromEntries(['eventsByDay','signatureByDay','certifyStatus','inspectionByDay','formByDay'].map(key=>[key,state[key]]));
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 if(process.env.TEST_BROWSERS&&!process.env.TEST_BROWSERS.split(',').includes(name))continue;
 for(const type of ['bol','pod']){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'attachment-scanner-'));
  const context=await engine.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],readerRequests=[];page.setDefaultTimeout(45000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/\/api\/.*(?:ocr|reader|extract|analy[sz])|tesseract/i.test(request.url()))readerRequests.push(request.url());});
  try{
   await setupRoutes(context);
   const state=baseState();state.view='logbook';state.routeLegsByDay={};state.loadInfo={};
   const guide={id:'attachment-guide-A',source:'rate_confirmation',status:'active',loadNo:'131791226',broker:'Synthetic Broker',pickupCity:'Chicago',pickupState:'IL',deliveryCity:'East Haven',deliveryState:'CT',stops:[{id:'pickup',type:'pickup',city:'Chicago',state:'IL'},{id:'delivery',type:'delivery',city:'East Haven',state:'CT'}],steps:[{id:type==='pod'?'final_pod':'pickup_bol',kind:'document',documentType:type,stopSequence:type==='pod'?1:0,title:type==='pod'?'Upload final POD':'Capture BOL and seal',description:'Synthetic document test'}]};
   state.loadGuidesById={[guide.id]:guide};state.activeLoadGuideId=guide.id;
   state.testInstructionStore={loads:[],documents:[]};
   await seed(page,state);
   const before=protectedData((await stored(page)).state);
   await page.locator('.adaptive-home-v1038').getByRole('button',{name:'Add',exact:true}).first().click();
   const sheet=page.locator('.attachment-ios-v427');
   await sheet.getByRole('heading',{name:'Add your '+type.toUpperCase(),exact:true}).waitFor();
   for(const colorScheme of ['light','dark'])for(const width of [320,390,430]){
    await page.emulateMedia({colorScheme});await page.setViewportSize({width,height:844});
    const sizes=await sheet.evaluate(el=>({width:el.clientWidth,content:el.scrollWidth,screen:innerWidth,ink:getComputedStyle(el.querySelector('h1')).color,paper:getComputedStyle(el).backgroundColor}));
    assert.ok(sizes.content<=sizes.width+1,JSON.stringify(sizes));assert.notEqual(sizes.ink,sizes.paper);
    await page.screenshot({path:`${output}/${name}-${type}-${colorScheme}-${width}.png`});
   }
   await page.emulateMedia({colorScheme:'light'});await page.setViewportSize({width:390,height:844});
   let originalPdf,originalPhoto;
   if(type==='pod'){
    originalPdf=simplePdf('SYNTHETIC SIGNED DELIVERY\nUnrelated printed reference 99999 must not replace selected load.');
    await sheet.locator('input[type=file][accept="application/pdf,.pdf"]').setInputFiles({name:'signed-delivery.pdf',mimeType:'application/pdf',buffer:originalPdf});
   }else{
    const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=600;canvas.height=800;const ctx=canvas.getContext('2d');ctx.fillStyle='#dedede';ctx.fillRect(0,0,600,800);ctx.fillStyle='white';ctx.fillRect(25,25,550,750);ctx.fillStyle='black';ctx.font='24px sans-serif';ctx.fillText('SYNTHETIC BOL',60,85);for(let y=140;y<630;y+=48)ctx.fillText('Document contents are not read.',60,y);ctx.strokeStyle='#1844ab';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(70,700);ctx.bezierCurveTo(160,630,140,750,230,680);ctx.stroke();return canvas.toDataURL('image/png').split(',')[1];});
    originalPhoto=Buffer.from(png,'base64');
    await sheet.locator('input[type=file][multiple]').setInputFiles([{name:'page-one.png',mimeType:'image/png',buffer:originalPhoto},{name:'page-two.png',mimeType:'image/png',buffer:originalPhoto}]);
    await sheet.getByRole('button',{name:'Crop & rotate',exact:true}).click();
    const crop=page.locator('[data-road-ready-scanner-review="four-corner-v10931"]');await crop.waitFor();
    await crop.getByRole('button',{name:'Full page',exact:true}).click();
    const corner=crop.getByRole('button',{name:'Top left corner',exact:true});
    await corner.focus();await corner.press('ArrowRight');await corner.press('ArrowDown');
    await crop.getByRole('button',{name:'Rotate',exact:true}).click();
    await crop.getByRole('button',{name:'Use page',exact:true}).click();
    await sheet.getByRole('button',{name:'Move page 1 later',exact:true}).click();
    assert.match(await sheet.locator('.scan-page-list-v328 li').first().innerText(),/page-two.png/);
    await page.screenshot({path:`${output}/${name}-${type}-adjusted-pages.png`});
   }
   await sheet.getByRole('button',{name:'Save '+type.toUpperCase(),exact:true}).click();
   await sheet.getByRole('heading',{name:type.toUpperCase()+' saved',exact:true}).waitFor();
   const saved=await stored(page);assert.ok(saved.docs.length>=1,'a durable document exists');
   const doc=saved.docs.find(doc=>doc.type===type||doc.document_type===type||doc.extracted?.type===type);assert.ok(doc,'correct document type');
   assert.equal(String(doc.load_no||doc.extracted?.loadNo||doc.metadata?.loadNo),'131791226');
   assert.ok(saved.blobs.some(row=>row.bytes?.length),'document bytes are durable');
   if(originalPdf)assert.ok(saved.blobs.some(row=>row.bytes&&Buffer.from(row.bytes).equals(originalPdf)),'PDF bytes are unchanged');
   if(originalPhoto){const originals=saved.assets.filter(row=>row.variants?.some(v=>v.kind==='original'));assert.equal(originals.length,2,'originals for both pages retained');for(const row of originals)assert.deepEqual(Buffer.from(row.bytes),originalPhoto);}
   assert.deepEqual(protectedData(saved.state),before,'capture does not write duty or signature records');
   assert.deepEqual(readerRequests,[],'direct attachments never call the reader');
   assert.deepEqual(errors,[]);
   await sheet.getByRole('button',{name:'Done',exact:true}).click();
   await page.reload();await page.locator('.adaptive-home-v1038').waitFor();
   const reloaded=await stored(page);assert.equal(reloaded.docs.length,saved.docs.length,'document survives reload');assert.equal(reloaded.assets.length,saved.assets.length,'original assets survive reload');
   reports.push({browser:name,type,passed:true,originalPdf:!!originalPdf,noReader:true});
   console.log('PASS — '+name+' direct '+type+': capture/review, readable mobile layouts, correct load/type, durable originals, no reader, unchanged logbook');
  }catch(error){await page.screenshot({path:`${output}/${name}-${type}-failure.png`}).catch(()=>{});fs.writeFileSync(`${output}/${name}-${type}-failure.json`,JSON.stringify({error:error.stack,pageErrors:errors,body:await page.locator('body').innerText()},null,2));throw error;}
  finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
 }
}
fs.writeFileSync(`${output}/report.json`,JSON.stringify(reports,null,2));
