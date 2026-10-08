import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
const output='browser-test-results/simple-documents-v110404/full-page-v110428';
fs.mkdirSync(output,{recursive:true});
const reports=[],full=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
async function stored(page) {return page.evaluate(()=>new Promise((resolve,reject)=>{
 const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);
 request.onsuccess=()=>{const db=request.result,tx=db.transaction(['documents_local','document_blobs','app_snapshots'],'readonly');
 const docs=tx.objectStore('documents_local').getAll(),blobs=tx.objectStore('document_blobs').getAll(),state=tx.objectStore('app_snapshots').get('owner-op-road-ready-state-v1');
 tx.oncomplete=async()=>{db.close();try{
  let topInk=0,bottomInk=0;
  const blob=blobs.result[0]?.blob||blobs.result[0]?.processed_blob||blobs.result[0]?.original_blob;
  if(blob){const url=URL.createObjectURL(window.__rrFixtureBlob(blob)),image=new Image();try{await new Promise((ok,no)=>{image.onload=ok;image.onerror=no;image.src=url;});const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const c=canvas.getContext('2d');c.drawImage(image,0,0);const {data}=c.getImageData(0,0,canvas.width,canvas.height);
   for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4,r=data[i],g=data[i+1],b=data[i+2];if(y<canvas.height*.14&&r>g*1.6&&r>b*1.6)topInk++;if(y>canvas.height*.86&&b>r*1.5&&b>g*1.3)bottomInk++;}
  }finally{URL.revokeObjectURL(url);}}
  resolve({docs:docs.result,state:state.result?.state,topInk,bottomInk});
 }catch(error){reject(error);}};tx.onerror=()=>reject(tx.error);};
}));}
const protectedData=s=>Object.fromEntries(['eventsByDay','signatureByDay','certifyStatus','inspectionByDay','formByDay'].map(k=>[k,s[k]]));
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
 if(process.env.TEST_BROWSERS&&!process.env.TEST_BROWSERS.split(',').includes(name))continue;
 for(const type of ['bol','pod']) {
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'full-page-'));
  const context=await engine.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],readerRequests=[];page.setDefaultTimeout(45000);
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/api\/.*(?:ocr|reader|extract)|tesseract/i.test(r.url()))readerRequests.push(r.url());});
  try {
   await setupRoutes(context);
   const state=baseState();state.view='logbook';state.routeLegsByDay={};state.loadInfo={};
   const guide={id:'full-page-test',status:'active',source:'rate_confirmation',loadNo:'FRAME-428',broker:'Synthetic Broker',stops:[{id:'pickup',type:'pickup',city:'Chicago',state:'IL'},{id:'delivery',type:'delivery',city:'Example',state:'CT'}],steps:[{id:type==='pod'?'final_pod':'pickup_bol',kind:'document',documentType:type,stopSequence:type==='pod'?1:0,title:type==='pod'?'Upload final POD':'Capture BOL and seal'}]};
   state.loadGuidesById={[guide.id]:guide};state.activeLoadGuideId=guide.id;state.testInstructionStore={loads:[],documents:[]};
   await seed(page,state);const before=protectedData((await stored(page)).state);
   await page.locator('.adaptive-home-v1038').getByRole('button',{name:'Add',exact:true}).first().click();
   const sheet=page.locator('.attachment-ios-v427');await sheet.getByRole('heading',{name:'Add your '+type.toUpperCase(),exact:true}).waitFor();
   const jpeg=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=600;canvas.height=800;const c=canvas.getContext('2d');c.fillStyle='#f3f3f3';c.fillRect(0,0,600,800);c.strokeStyle='#121212';c.lineWidth=4;c.strokeRect(48,170,510,430);for(let y=200;y<598;y+=40){c.beginPath();c.moveTo(48,y);c.lineTo(558,y);c.stroke();}c.fillStyle='#b82222';c.fillRect(85,20,120,24);c.fillStyle='#183c9e';c.fillRect(370,752,145,24);c.fillStyle='#222';c.font='22px sans-serif';c.fillText('SYNTHETIC DOCUMENT',80,110);c.fillText('Synthetic signed footer',260,728);return canvas.toDataURL('image/jpeg',.93).split(',')[1];});
   await sheet.locator('input[type=file][multiple]').setInputFiles({name:'already-scanned-form.jpg',mimeType:'image/jpeg',buffer:Buffer.from(jpeg,'base64')});
   await page.waitForFunction(()=>document.querySelector('[aria-label="Document scanner"]')?.getAttribute('aria-busy')==='false');
   await sheet.getByRole('button',{name:'Save '+type.toUpperCase(),exact:true}).waitFor();
   assert.equal(await page.locator('[data-road-ready-scanner-review]').count(),0,'automatic intake needs no crop editor');
   assert.equal(await sheet.getByRole('list',{name:'Document page order'}).count(),0,'single page has no duplicate thumbnail strip');
   for(const width of [320,390,430])for(const colorScheme of ['light','dark']) {
    await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme});
    const box=await sheet.getByRole('button',{name:'Enlarge selected page',exact:true}).boundingBox();assert.ok(box.height>300&&box.x>=0&&box.x+box.width<=width+1,JSON.stringify(box));
    await page.screenshot({path:`${output}/${name}-${type}-${width}-${colorScheme}.png`});
   }
   // Save immediately, with no Full page, Auto edges or manual corner actions.
   await sheet.getByRole('button',{name:'Save '+type.toUpperCase(),exact:true}).click();
   await sheet.getByRole('heading',{name:type.toUpperCase()+' saved',exact:true}).waitFor();
   const saved=await stored(page),doc=saved.docs.find(d=>d.type===type||d.document_type===type);assert.ok(doc);
   assert.equal(doc.load_no,'FRAME-428');
   const manifest=doc.capture_manifest?.pages?.[0];assert.ok(manifest,'saved capture manifest');
   assert.deepEqual(manifest.boundary.corners,full,'full frame selected without adjustment');
   assert.equal(manifest.detection.method,'already-framed-paper-v110428');
   assert.ok(saved.topInk>100&&saved.bottomInk>100,'both header and signature markers survive in saved image');
   assert.deepEqual(protectedData(saved.state),before);assert.deepEqual(readerRequests,[]);assert.deepEqual(errors,[]);
   await page.reload();await page.locator('.adaptive-home-v1038').waitFor();const reload=await stored(page);assert.equal(reload.docs.length,saved.docs.length);assert.ok(reload.topInk>100&&reload.bottomInk>100);
   reports.push({browser:name,type,passed:true,fullFrame:true,headerAndFooterPreserved:true,noManualCrop:true,noReader:true});
   console.log('PASS — '+name+' '+type+' keeps full photo/header/signature, saves immediately, survives reload');
  } catch(error) {await page.screenshot({path:`${output}/${name}-${type}-failure.png`}).catch(()=>{});fs.writeFileSync(`${output}/${name}-${type}-failure.json`,JSON.stringify({error:error.stack,errors,body:await page.locator('body').innerText()},null,2));throw error;}
  finally {await context.close();fs.rmSync(profile,{recursive:true,force:true});}
 }
}
fs.writeFileSync(`${output}/report.json`,JSON.stringify(reports,null,2));
