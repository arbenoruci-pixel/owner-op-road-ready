import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {PDFDocument} from 'pdf-lib';
import {baseState,seed,setupRoutes,simplePdf} from './v110328/browserFixture.mjs';
const output='browser-test-results/scanner-workflow-v110328';fs.mkdirSync(output,{recursive:true});
const reports=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]) {
  const profilePath=fs.mkdtempSync(path.join(os.tmpdir(),'scanner-normal-profile-'));
  // Persistent contexts reproduce ordinary Safari/PWA storage. WebKit private
  // contexts intentionally cannot persist Blob/File payloads to IndexedDB.
  const context=await type.launchPersistentContext(profilePath,{headless:true,viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage();page.setDefaultTimeout(45000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    await setupRoutes(context);
    const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};await seed(page,state);
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.getByRole('heading',{name:/A clear scan/}).waitFor();
    assert.equal(await page.evaluate(()=>document.querySelector('.scan-intake-v328').scrollWidth<=innerWidth),true);
    await page.screenshot({path:`${output}/${name}-choose.png`});
    const images=await page.evaluate(async()=>{
      const files=[];
      for(let i=1;i<=2;i++){
        const c=document.createElement('canvas');c.width=1000;c.height=1400;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=i===1?'#2057b0':'#b02720';ctx.fillRect(60,50,120,40);ctx.fillStyle='#111';ctx.font='bold 30px Arial';ctx.fillText('EXAMPLE FUEL RECEIPT',60,160);ctx.font='24px Arial';['DATE: 09/13/2026','TOTAL: $55.00','GALLONS: 12.00','DIESEL FUEL','Page '+i+' of 2'].forEach((line,n)=>ctx.fillText(line,60,230+n*60));
        const blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.92));files.push(Array.from(new Uint8Array(await blob.arrayBuffer())));
      }
      // Only OCR is deterministic here. Native selection, decoding, crop,
      // reader orchestration, generated PDF and durable storage are real.
      window.__scanOcrCalls=0;
      window.__scanOcrText='EXAMPLE FUEL RECEIPT\nDATE: 09/13/2026\nTOTAL: $55.00\nGALLONS: 12.00\nDIESEL FUEL\nEXAMPLE FUEL STATION';
      window.Tesseract={createWorker:async(_language,_engine,options)=>({setParameters:async()=>{},terminate:async()=>{},recognize:async()=>{window.__scanOcrCalls++;options.logger({status:'recognizing text',progress:.8});options.logger({status:'recognizing text',progress:.2});return {data:{text:window.__scanOcrText,confidence:96}};}})};
      return files;
    });
    const photos=page.locator('input[type=file][multiple]'),fileInput=page.locator('input[type=file][accept*="application/pdf"]');
    await photos.setInputFiles(images.map((bytes,i)=>({name:`example-page-${i+1}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(bytes)})));
    await page.getByRole('button',{name:'Read document',exact:true}).waitFor();
    await page.getByRole('button',{name:'Crop & rotate',exact:true}).click();
    await page.getByText('Crop & rotate',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Full page',exact:true}).click();
    await page.getByRole('button',{name:'Top left',exact:true}).focus();await page.keyboard.press('ArrowRight');
    await page.screenshot({path:`${output}/${name}-crop.png`});
    await page.getByRole('button',{name:'Use page',exact:true}).click();
    await page.getByRole('button',{name:'Reorder pages',exact:true}).click();
    await page.getByRole('button',{name:'Move page 1 later',exact:true}).click();
    assert.deepEqual(await page.locator('.scan-page-list-v328 small').allTextContents(),['example-page-2.jpg','example-page-1.jpg']);
    await page.getByRole('button',{name:'Reorder pages',exact:true}).click();
    const beforeRotation=await page.locator('.scan-paper-preview-v328 img').evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));
    await page.getByRole('button',{name:'Rotate selected page',exact:true}).click();
    await page.getByRole('button',{name:'Read document',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('.scan-paper-preview-v328 img')?.naturalWidth>document.querySelector('.scan-paper-preview-v328 img')?.naturalHeight);
    const rotated=await page.locator('.scan-paper-preview-v328 img').evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));
    assert.ok(Math.abs(rotated.w-beforeRotation.h)<=2&&Math.abs(rotated.h-beforeRotation.w)<=2,'quick rotate preserves the selected crop');
    await page.getByRole('button',{name:'Enlarge selected page'}).click();await page.getByRole('dialog',{name:'Full page preview'}).waitFor();
    const fit=await page.locator('.scan-zoom-fit-v333').evaluate(box=>({w:box.clientWidth,h:box.clientHeight,sw:box.scrollWidth,sh:box.scrollHeight}));
    assert.ok(fit.sw<=fit.w+1&&fit.sh<=fit.h+1,'the whole page fits when the preview opens');
    await page.getByRole('button',{name:'Zoom in',exact:true}).click();
    assert.ok(await page.locator('.scan-zoom-detail-v333').evaluate(box=>box.scrollWidth>box.clientWidth),'small print can be enlarged and panned');
    await page.getByRole('button',{name:'Fit page',exact:true}).click();
    await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'Full page preview'}).waitFor({state:'hidden'});
    assert.equal(await page.getByRole('button',{name:'Enlarge selected page'}).evaluate(button=>button===document.activeElement),true,'preview restores focus');
    await fileInput.setInputFiles({name:'unrelated.pdf',mimeType:'application/pdf',buffer:simplePdf('another document')});
    await page.getByRole('alert').filter({hasText:'one document'}).waitFor();
    assert.equal(await page.locator('.scan-page-list-v328 li').count(),2);
    await photos.setInputFiles({name:'broken.jpg',mimeType:'image/jpeg',buffer:Buffer.from('not a photo')});
    await page.getByRole('alert').filter({hasText:'format'}).waitFor();
    assert.equal(await page.locator('.scan-page-list-v328 li').count(),2);
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByText('Read 2 of 2 pages. Check the details below.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Back',exact:true}).click();
    assert.deepEqual(await page.locator('.scan-page-list-v328 small').allTextContents(),['example-page-2.jpg','example-page-1.jpg']);
    await page.waitForFunction(()=>document.querySelector('.scan-paper-preview-v328 img')?.naturalWidth>0);
    await page.screenshot({path:`${output}/${name}-pages.png`});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByText('Read 2 of 2 pages. Check the details below.',{exact:true}).waitFor();
    const review=page.locator('.scan-driver-check-v105 input');if(await review.count())await review.check();
    await page.getByRole('button',{name:/^Save document$|^Save for review$/}).click();
    await page.locator('.scan-saved-v105').waitFor();
    const stored=await page.evaluate(async()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction(['document_blobs','capture_asset_blobs'],'readonly'),primary=tx.objectStore('document_blobs').getAll(),assets=tx.objectStore('capture_asset_blobs').getAll();tx.oncomplete=async()=>{try{const main=primary.result.find(row=>row.blob?.type==='application/pdf');resolve({primary:main?Array.from(new Uint8Array(await main.blob.arrayBuffer())):null,assets:await Promise.all(assets.result.filter(row=>row.blob||row.file).map(async row=>({...row,blob:undefined,file:undefined,bytes:Array.from(new Uint8Array(await(row.blob||row.file).arrayBuffer()))}))),store:JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1'))});}catch(e){reject(e);}finally{db.close();}};};}));
    assert.ok(stored.primary,'multipage PDF is durable');
    const savedPdf=await PDFDocument.load(new Uint8Array(stored.primary));assert.equal(savedPdf.getPageCount(),2);
    // The actual save confirmation opens the same durable multipage PDF.
    const savedLocation=page.locator('.scan-saved-location-v344');
    assert.match(await savedLocation.innerText(),/Documents → Recent documents/);
    const savedFile=savedLocation.getByRole('link',{name:'Open PDF',exact:true});await savedFile.waitFor();
    const savedBytes=await savedFile.evaluate(async link=>Array.from(new Uint8Array(await(await fetch(link.href)).arrayBuffer())));
    assert.deepEqual(savedBytes,stored.primary,'save confirmation links to the complete stored original');
    await savedLocation.scrollIntoViewIfNeeded();
    await page.screenshot({path:`${output}/${name}-saved-file.png`});
    // Original source bytes survive every edit and reorder.
    for(const [index,original] of images.entries()){const asset=stored.assets.find(asset=>Buffer.from(asset.bytes).equals(Buffer.from(original)));assert.ok(asset,'original capture bytes are preserved');assert.equal(asset.page_index,1-index,'capture assets follow the reviewed page order');}
    await page.getByRole('button',{name:'Scan another',exact:true}).click();
    await page.locator('input[type=file][accept*="application/pdf"]').setInputFiles({name:'example-scanned-pages.pdf',mimeType:'application/pdf',buffer:Buffer.from(stored.primary)});
    await page.getByText('Page 1 of 2',{exact:true}).waitFor();
    await page.locator('canvas[aria-label="PDF preview, page 1"]:visible').waitFor();
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByText('Read 2 of 2 pages. Check the details below.',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'fuel_receipt','scanned PDFs use the image reader');
    await page.getByRole('button',{name:'New',exact:true}).click();
    const pdfBytes=simplePdf('BILL OF LADING\nBOL NO 550099\nDATE: 09/13/2026\nSHIP FROM: EXAMPLE SHIPPER\nSHIP TO: EXAMPLE RECEIVER\nCARRIER: EXAMPLE CARRIER LLC\nTOTAL WEIGHT: 2000 LB\nDESCRIPTION: TEST MATERIALS\nNUMBER OF PIECES: 20\nTRAILER NUMBER: EXAMPLE12');
    await page.locator('input[type=file][accept*="application/pdf"]').setInputFiles({name:'example-shipping.pdf',mimeType:'application/pdf',buffer:pdfBytes});
    await page.getByRole('heading',{name:'Check your pages',exact:true}).waitFor();
    await page.getByText('Page 1 of 1',{exact:true}).waitFor();
    await page.locator('canvas[aria-label="PDF preview, page 1"]:visible').waitFor();
    await page.getByRole('button',{name:'Enlarge PDF preview',exact:true}).click();
    await page.getByRole('dialog',{name:'PDF page preview'}).waitFor();
    assert.ok(await page.locator('.scan-pdf-expanded-v328 canvas').evaluate(canvas=>canvas.getBoundingClientRect().width>=900));
    await page.getByRole('button',{name:'Close PDF preview',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Read document',exact:true}).isEnabled(),true);
    await page.screenshot({path:`${output}/${name}-pdf.png`});
    await page.getByRole('button',{name:'Read document',exact:true}).click();await page.getByLabel('Document type',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'bol');
    // Ordinary carrier/trailer words cannot establish a Gate Pass identity.
    await page.getByRole('button',{name:'New',exact:true}).click();
    await page.evaluate(()=>{
      window.__uncertainOcrStart=window.__scanOcrCalls;
      window.__scanOcrText='CARRIER: EXAMPLE TRUCKING\nTRAILER # 7791\nArrival time: 8 AM';
    });
    await photos.setInputFiles({name:'example-uncertain.jpg',mimeType:'image/jpeg',buffer:Buffer.from(images[0])});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByLabel('Document type',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'other');
    assert.equal(await page.evaluate(()=>window.__scanOcrCalls>window.__uncertainOcrStart),true,'the uncertain image receives a fresh OCR reading');
    await page.locator('.scan-type-evidence-v334').filter({hasText:'Document type is uncertain'}).waitFor();
    await page.getByLabel('Document type',{exact:true}).selectOption('bol');
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'bol');
    await page.locator('.scan-type-evidence-v334').waitFor({state:'hidden'});
    // Different BOL numbers on separate, real PDF pages require review.
    const mixedPdf=await PDFDocument.create();
    for(const ref of ['550099','771111']){
      const source=await PDFDocument.load(simplePdf(`BILL OF LADING\nBOL NO ${ref}\nSHIP FROM EXAMPLE SHIPPER\nSHIP TO EXAMPLE RECEIVER\nCARRIER EXAMPLE TRUCKING\nWEIGHT 2000 LB`));
      const [sheet]=await mixedPdf.copyPages(source,[0]);mixedPdf.addPage(sheet);
    }
    await page.getByRole('button',{name:'New',exact:true}).click();
    await fileInput.setInputFiles({name:'example-mixed-shipments.pdf',mimeType:'application/pdf',buffer:Buffer.from(await mixedPdf.save())});
    await page.getByText('Page 1 of 2',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByLabel('Document type',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'other');
    await page.locator('.scan-type-evidence-v334').filter({hasText:'different BOL numbers'}).waitFor();
    await page.getByLabel('Document type',{exact:true}).selectOption('bol');
    await page.locator('.scan-type-evidence-v334').filter({hasText:'different BOL numbers'}).waitFor();
    await page.screenshot({path:`${output}/${name}-mixed-documents.png`});
    assert.deepEqual(errors,[]);
    reports.push({browser:name,passed:true});console.log(`PASS — ${name}: multiple selection, crop, reorder, preview, recovery, PDF pages and immutable source storage`);
  }catch(error){reports.push({browser:name,passed:false,error:String(error),errors});console.error(error);await page.screenshot({path:`${output}/${name}-FAILED.png`}).catch(()=>{});}
  finally{await context.close();fs.rmSync(profilePath,{recursive:true,force:true});}
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));assert.ok(reports.every(report=>report.passed),JSON.stringify(reports));
