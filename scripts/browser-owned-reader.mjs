import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes} from './v110328/browserFixture.mjs';
import {shippingLayoutInput} from '../packages/smart-reader-core/test/shipping-layout-fixture.mjs';

const output='browser-test-results/owned-reader';fs.mkdirSync(output,{recursive:true});
for(const [name,browser] of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.TEST_BROWSER||process.env.TEST_BROWSER===name)){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'owned-reader-'));
  const context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage();page.setDefaultTimeout(45000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await setupRoutes(context);
    await context.addInitScript(()=>{
      window.__ownedReaderCalls=0;
      const defaultLines=['BILL OF LADING','BOL No: BOL-123','Ship From: Example Shipper','Ship To: Example Receiver','Weight: 12000 LB'];
      window.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async(file)=>{
        window.__ownedReaderCalls++;
        if(window.__ownedReaderLayout){
          const bitmap=await createImageBitmap(file),width=bitmap.width,height=bitmap.height;bitmap.close();
          const lines=structuredClone(window.__ownedReaderLayout);
          if(window.__ownedReaderCalls%2===0)lines.find(line=>line.text==='Example Foods Ing').text='Example Foods Inc';
          const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
          const rows=lines.map((line,i)=>`5\t1\t1\t1\t${i+1}\t1\t${Math.round(line.box.x*width)}\t${Math.round(line.box.y*height)}\t${Math.max(1,Math.round(line.box.width*width))}\t${Math.max(1,Math.round(line.box.height*height))}\t${line.confidence*100}\t${line.text}`);
          return {data:{text:lines.map(line=>line.text).join('\n'),confidence:70,tsv:[header,...rows].join('\n')}};
        }
        const lines=window.__ownedReaderLines||defaultLines;
        const bitmap=await createImageBitmap(file),scaleX=bitmap.width/700,scaleY=bitmap.height/1000;bitmap.close();
        const measure=document.createElement('canvas').getContext('2d');measure.font='24px Arial';
        const rows=['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext'];
        lines.forEach((line,i)=>{let x=30;line.split(' ').forEach((word,j)=>{const width=measure.measureText(word).width;rows.push(`5\t1\t1\t1\t${i+1}\t${j+1}\t${Math.round(x*scaleX)}\t${Math.round((40+i*65)*scaleY)}\t${Math.round(width*scaleX)}\t${Math.round(24*scaleY)}\t96\t${word}`);x+=width+measure.measureText(' ').width;});});
        return {data:{text:lines.join('\n'),confidence:96,tsv:rows.join('\n')}};
      }})};
    });
    const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};await seed(page,state);
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    const photo=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=700;canvas.height=1000;
      const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,700,1000);ctx.fillStyle='black';ctx.font='24px Arial';
      ['BILL OF LADING','BOL No: BOL-123','Ship From: Example Shipper','Ship To: Example Receiver','Weight: 12000 LB'].forEach((text,i)=>ctx.fillText(text,30,64+i*65));
      return [...new Uint8Array(await(await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95))).arrayBuffer())];
    });
    const input=page.locator('input[type=file][multiple]').first();
    await input.setInputFiles({name:'source.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photo)});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
    const review=page.locator('.owned-reader-preview');
    await review.getByText('1 page · 1 document',{exact:true}).waitFor();
    const calls=await page.evaluate(()=>window.__ownedReaderCalls);
    const folder=await page.getByLabel('Load folder',{exact:true}).inputValue();
    assert.equal(await review.getByRole('button',{name:'BOL-123 · Page 1',exact:true}).count(),1,'retries are consolidated into one source choice per page');
    await review.getByRole('button',{name:'BOL-123 · Page 1',exact:true}).click();
    await review.locator('mark').getByText('BOL-123',{exact:true}).waitFor();
    await review.getByRole('img',{name:'Source image for page 1',exact:true}).waitFor();
    await review.getByLabel('Source line highlight',{exact:true}).waitFor();
    const highlightTop=await review.getByLabel('Source line highlight',{exact:true}).evaluate(el=>parseFloat(el.style.top));
    assert.ok(Math.abs(highlightTop-10.5)<.2,'highlight follows the BOL number at its original page position after OCR image resizing');
    await review.locator('.owned-reader-inspect').screenshot({path:`${output}/${name}-source.png`});
    await review.getByLabel('Confirmed value',{exact:true}).fill('BOL-129');
    await review.getByRole('button',{name:'Confirm value in preview',exact:true}).click();
    await review.getByText('Confirmed in preview',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Load folder',{exact:true}).inputValue(),folder,'preview corrections do not assign or rename the load');
    assert.equal(await page.evaluate(()=>window.__ownedReaderCalls),calls,'source review does not rerun OCR');
    const download=page.waitForEvent('download');
    await review.getByRole('button',{name:'Export reading review',exact:true}).click();
    const file=await download;const saved=JSON.parse(fs.readFileSync(await file.path(),'utf8'));
    assert.equal(saved.documents[0].fields.bolNumber.value,'BOL-129');
    assert.equal(saved.corrections[0].sourceQuote,'BOL-123');
    assert.equal(saved.corrections[0].trainingEligible,false);
    assert.equal(saved.documents[0].canAutoFile,false);
    assert.equal(saved.pages[0].observations[0].source,'existing-phone-ocr');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'mobile review fits viewport');
    await page.screenshot({path:`${output}/${name}-review.png`,fullPage:true});
    await page.getByRole('button',{name:'Back',exact:true}).click();
    assert.equal(await page.locator('.scan-page-list-v328 li').count(),1,'original selected page survives review');
    // A second scan exercises arithmetic edits through the actual preview UI.
    const invoiceLines=['INVOICE','Invoice No: INV-17','Vendor: Example Company','Date: 2026-09-13','Subtotal: 100.00','Tax: 8.25','Total: 108.25','Currency: USD'];
    await page.goto(new URL('/_not-found',page.url()).href);
    await page.evaluate(async()=>{
      localStorage.clear();
      await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase('owner-op-road-ready-offline-v1');request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Previous fixture database is still open'));});
    });
    await seed(page,state);
    await page.evaluate(lines=>{window.__ownedReaderLines=lines;},invoiceLines);
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    const invoicePhoto=await page.evaluate(async lines=>{
      const canvas=document.createElement('canvas');canvas.width=700;canvas.height=1000;
      const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,700,1000);ctx.fillStyle='black';ctx.font='24px Arial';
      lines.forEach((text,i)=>ctx.fillText(text,30,64+i*65));
      return [...new Uint8Array(await(await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95))).arrayBuffer())];
    },invoiceLines);
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'invoice.jpg',mimeType:'image/jpeg',buffer:Buffer.from(invoicePhoto)});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
    await review.getByRole('button',{name:'108.25 · Page 1',exact:true}).click();
    await review.getByLabel('Confirmed value',{exact:true}).fill('118.25');
    await review.getByRole('button',{name:'Confirm value in preview',exact:true}).click();
    const warning=review.getByText('Subtotal plus tax does not match the total. Check the amounts.',{exact:true});
    await warning.waitFor();
    const warningDownload=page.waitForEvent('download');
    await review.getByRole('button',{name:'Export reading review',exact:true}).click();
    const warningFile=await warningDownload;
    const inconsistent=JSON.parse(fs.readFileSync(await warningFile.path(),'utf8'));
    assert.equal(inconsistent.documents[0].checks[0].status,'needs_review');
    assert.equal(inconsistent.documents[0].fields.total.correction.value,'118.25');
    await review.getByRole('button',{name:'8.25 · Page 1',exact:true}).click();
    await review.getByLabel('Confirmed value',{exact:true}).fill('18.25');
    await review.getByRole('button',{name:'Confirm value in preview',exact:true}).click();
    await warning.waitFor({state:'hidden'});
    await review.getByText('118.25',{exact:true}).waitFor();
    // Real two-column OCR lines pass through the phone adapter and source UI.
    await page.goto(new URL('/_not-found',page.url()).href);
    await page.evaluate(async()=>{
      localStorage.clear();
      await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase('owner-op-road-ready-offline-v1');request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Previous fixture database is still open'));});
    });
    await seed(page,state);
    const layout=shippingLayoutInput().pages[0].observations[0].lines;
    const layoutPhoto=await page.evaluate(async lines=>{
      window.__ownedReaderLayout=lines;window.__ownedReaderCalls=0;
      const canvas=document.createElement('canvas');canvas.width=700;canvas.height=1000;
      const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,700,1000);ctx.fillStyle='black';
      for(const line of lines){ctx.font=`${Math.max(1,line.box.height*1000)}px Arial`;ctx.fillText(line.text.replace('Example Foods Ing','Example Foods Inc'),line.box.x*700,(line.box.y+line.box.height)*1000,line.box.width*700);}
      return [...new Uint8Array(await(await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95))).arrayBuffer())];
    },layout);
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'shipping-layout.jpg',mimeType:'image/jpeg',buffer:Buffer.from(layoutPhoto)});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
    await review.getByRole('heading',{name:'Bill of lading · 1',exact:true}).waitFor();
    assert.equal(await page.locator('.scan-evidence-value-v11038').filter({hasText:/^(garbled barcode|1200)$/}).count(),0,'flattened column guesses are absent from filing evidence');
    await review.getByRole('button',{name:'Example Foods Inc · Page 1',exact:true}).click();
    const sourceTop=await review.getByLabel('Source line highlight',{exact:true}).evaluate(el=>parseFloat(el.style.top));
    assert.ok(Math.abs(sourceTop-11.8)<.2,'source highlight points below the centered shipping label');
    await review.getByRole('button',{name:'Confirm value in preview',exact:true}).click();
    const layoutDownload=page.waitForEvent('download');
    await review.getByRole('button',{name:'Export reading review',exact:true}).click();
    const layoutFile=await layoutDownload,layoutResult=JSON.parse(fs.readFileSync(await layoutFile.path(),'utf8'));
    assert.equal(layoutResult.pageCount,1);
    assert.equal(layoutResult.documents[0].fields.shipper.status,'confirmed');
    assert.equal(layoutResult.documents[0].fields.trailerNumber.value,null);
    assert.equal(layoutResult.documents[0].fields.documentDate.value,null);
    assert.equal(layoutResult.corrections[0].trainingEligible,false);
    assert.ok(layoutResult.documents[0].fields.shipper.candidates.some(candidate=>candidate.labelEvidence?.length));
    await page.screenshot({path:`${output}/${name}-shipping-layout.png`,fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS '+name+' owned reader: page evidence, source image, correction, export and original retained');
  }catch(error){
    await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});
    fs.writeFileSync(`${output}/${name}-failure.txt`,JSON.stringify({error:String(error),pageErrors:errors,body:await page.locator('body').innerText().catch(()=>''),url:page.url()},null,2));
    throw error;
  }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
