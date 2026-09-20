import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes} from './v110328/browserFixture.mjs';
import {shippingLayoutInput} from '../packages/smart-reader-core/test/shipping-layout-fixture.mjs';
import {noisyPageInput} from '../packages/smart-reader-core/test/noisy-page-fixture.mjs';
import {mergedReceiptInput} from '../packages/smart-reader-core/test/merged-receipt-fixture.mjs';
import {receiptColumnsInput} from '../packages/smart-reader-core/test/receipt-columns-fixture.mjs';
import {partyBlocksInput} from '../packages/smart-reader-core/test/party-blocks-fixture.mjs';
import {truckingCases} from '../packages/smart-reader-core/test/trucking-catalog-fixture.mjs';

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
      window.Tesseract={createWorker:async()=>({setParameters:async parameters=>{
        if(parameters.tessedit_pageseg_mode)window.__ownedReaderMode=String(parameters.tessedit_pageseg_mode);
      },terminate:async()=>{},recognize:async(file)=>{
        window.__ownedReaderCalls++;
        if(window.__ownedReaderPacket&&window.__ownedReaderMode==='3'&&file.name==='road-ready-clean-ocr.png'){
          window.__ownedReaderCleanPages||=new WeakSet();
          if(!window.__ownedReaderCleanPages.has(file)){
            window.__ownedReaderCleanPages.add(file);window.__ownedReaderPacketPage++;window.__ownedReaderPacketRead=0;
          }
        }
        if(window.__ownedReaderFail)throw new Error('fixture OCR failure');
        if(window.__ownedReaderBlock){
          const bitmap=await createImageBitmap(file),width=bitmap.width,height=bitmap.height;bitmap.close();
          const crop=file.name?.includes('party-detail'),block=window.__ownedReaderMode==='6';
          const lines=crop?(block?['CONSIGNED REGIONAL MARKET','TO: TOWN DEPOT #1-2']:['FROM: NORTHERN FOODS']).map((text,i)=>({text,confidence:.98,box:{x:.03,y:.08+i*.45,width:.92,height:block?.3:.6}}))
            :window.__ownedReaderBlock[Math.min(window.__ownedReaderBlockRead++,2)];
          const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
          const rows=lines.map((line,i)=>`5\t1\t1\t1\t${i+1}\t1\t${Math.round(line.box.x*width)}\t${Math.round(line.box.y*height)}\t${Math.max(1,Math.round(line.box.width*width))}\t${Math.max(1,Math.round(line.box.height*height))}\t${line.confidence*100}\t${line.text}`);
          return {data:{text:lines.map(line=>line.text).join('\n'),confidence:96,tsv:[header,`1\t1\t0\t0\t0\t0\t0\t0\t${width}\t${height}\t-1\t`,...rows].join('\n')}};
        }
        if(window.__ownedReaderParty){
          const bitmap=await createImageBitmap(file),width=bitmap.width,height=bitmap.height;bitmap.close();
          const crop=file.name?.includes('party-detail'),first=window.__ownedReaderCalls===1,split=window.__ownedReaderCalls===3;
          const line=(text,x,y,w,h,confidence=96)=>({text,x,y,w,h,confidence});
          const lines=crop?[line('Carrier: TOTAL QUALITY LOGISTICS',.02,.2,.94,.5,99)]:[
            line('BILL OF LADING',.1,.03,.5,.025),line('BOL#: 123456-001',.1,.08,.4,.02),line('Ship Date: 9/11/2026',.1,.12,.4,.02),
            line('TO: Example Receiver',.1,.2,.4,.02),line('Carrier: '+(first?'TTA, QUALITY LOGISTICS':'TOTAL QUALITY LOGISTICS'),.51,.7,.4,.015,first?72:96),
            ...(split?[line('Shipper: EXAMPLE MILLS,',.05,.82,.18,.012),line('LLC #218',.24,.82,.07,.01)]:[line('Shipper: EXAMPLE MILLS, LLC #218',.05,.82,.28,.012)]),
          ];
          const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
          const rows=lines.map((line,i)=>`5\t1\t1\t1\t${i+1}\t1\t${Math.round(line.x*width)}\t${Math.round(line.y*height)}\t${Math.max(1,Math.round(line.w*width))}\t${Math.max(1,Math.round(line.h*height))}\t${line.confidence}\t${line.text}`);
          return {data:{text:lines.map(line=>line.text).join('\n'),confidence:96,tsv:[header,`1\t1\t0\t0\t0\t0\t0\t0\t${width}\t${height}\t-1\t`,...rows].join('\n')}};
        }
        if(window.__ownedReaderLayout||window.__ownedReaderPacket){
          const bitmap=await createImageBitmap(file),width=bitmap.width,height=bitmap.height;bitmap.close();
          const observations=window.__ownedReaderPacket?.[window.__ownedReaderPacketPage];
          const lines=structuredClone(observations?observations[Math.min(window.__ownedReaderPacketRead++,observations.length-1)]:window.__ownedReaderLayout);
          if(!window.__ownedReaderPacket&&window.__ownedReaderCalls%2===0)lines.find(line=>line.text==='Example Foods Ing').text='Example Foods Inc';
          const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
          const rows=lines.map((line,i)=>`5\t1\t1\t1\t${i+1}\t1\t${Math.round(line.box.x*width)}\t${Math.round(line.box.y*height)}\t${Math.max(1,Math.round(line.box.width*width))}\t${Math.max(1,Math.round(line.box.height*height))}\t${line.confidence*100}\t${line.text}`);
          return {data:{text:lines.map(line=>line.text).join('\n'),confidence:70,tsv:[header,...rows].join('\n')}};
        }
        const lines=window.__ownedReaderIdentifier&&file.name?.includes('identifier-detail')?['BALNO: 00991234']:(window.__ownedReaderLines||defaultLines);
        const bitmap=await createImageBitmap(file),scaleX=bitmap.width/700,scaleY=bitmap.height/1000;bitmap.close();
        const measure=document.createElement('canvas').getContext('2d');measure.font='24px Arial';
        const rows=['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',`1\t1\t0\t0\t0\t0\t0\t0\t${Math.round(scaleX*700)}\t${Math.round(scaleY*1000)}\t-1\t`];
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
    const sourceWindow=review.getByRole('region',{name:'Document source image',exact:true});
    const sourceImage=review.getByRole('img',{name:'Source image for page 1',exact:true});
    async function visibleHighlight(label='Source line highlight',wholeLine=true){
      // Read both rectangles in one frame while the review scrolls into view.
      const visible=await sourceWindow.evaluate((node,{label,wholeLine})=>{
        const frame=node.getBoundingClientRect(),box=node.querySelector(`[aria-label="${label}"]`)?.getBoundingClientRect();
        return box&&(wholeLine?box.x>=frame.x-2&&box.y>=frame.y-2&&box.right<=frame.right+2&&box.bottom<=frame.bottom+2:box.right>frame.x&&box.x<frame.right&&box.bottom>frame.y&&box.y<frame.bottom);
      },{label,wholeLine});
      assert.ok(visible,'selected evidence remains inside the focused source window');
    }
    await visibleHighlight();
    assert.ok((await sourceImage.boundingBox()).width>(await sourceWindow.boundingBox()).width,'tapping a field automatically magnifies its source');
    await review.getByLabel('Confirmed value',{exact:true}).fill('BOL-129');
    await review.getByRole('button',{name:'Full image',exact:true}).click();
    const whole=await sourceImage.boundingBox(),frame=await sourceWindow.boundingBox();
    assert.ok(whole.width<=frame.width+1&&whole.height<=frame.height+1,'full image provides context');
    await review.getByRole('button',{name:'Zoom in',exact:true}).click();
    assert.ok((await sourceImage.boundingBox()).height>whole.height,'zoom control enlarges the source');
    await review.getByRole('button',{name:'Zoom out',exact:true}).click();
    await review.getByRole('button',{name:'Focus on field',exact:true}).click();
    await sourceWindow.evaluate(node=>node.scrollTo(0,0));
    await review.getByRole('button',{name:'Focus on field',exact:true}).click();
    await visibleHighlight();
    assert.equal(await review.getByLabel('Confirmed value',{exact:true}).inputValue(),'BOL-129','zooming and refocusing preserve the correction draft');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'source zoom stays inside the phone viewport');
    await review.locator('.owned-reader-inspect').screenshot({path:`${output}/${name}-source.png`});
    await review.getByLabel('Confirmed value',{exact:true}).fill('BOL-129');
    await review.getByRole('button',{name:'Confirm value',exact:true}).click();
    await review.getByText('Confirmed',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Load folder',{exact:true}).inputValue(),folder,'preview corrections do not assign or rename the load');
    assert.equal(await page.evaluate(()=>window.__ownedReaderCalls),calls,'source review does not rerun OCR');
    // Closing and reopening keeps confirmations; a missing optional date is editable.
    await page.getByRole('button',{name:'Reader preview · Close',exact:true}).click();
    await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
    await review.getByText('BOL-129',{exact:true}).waitFor();
    await review.getByRole('button',{name:'Fix next reading',exact:true}).click();
    await review.getByRole('heading',{name:'Ship date · Page 1',exact:true}).waitFor();
    assert.equal(await review.getByLabel('Source line highlight',{exact:true}).count(),0,'a missing field has no invented source highlight');
    assert.equal(await review.getByRole('button',{name:'Focus on field',exact:true}).isDisabled(),true);
    await page.evaluate(()=>{window.__ownedReaderFail=true;});
    await review.getByRole('button',{name:'Reread this area',exact:true}).click();
    await review.getByText('Rereading failed. You can still enter the value or skip this field.',{exact:true}).waitFor();
    await page.evaluate(()=>{window.__ownedReaderFail=false;});
    await review.getByLabel('Confirmed value',{exact:true}).fill('2026-08-18');
    await review.getByRole('button',{name:'Save & next',exact:true}).click();
    await review.getByText('0 items to check',{exact:true}).waitFor();
    const download=page.waitForEvent('download');
    await review.getByRole('button',{name:'Export reading review',exact:true}).click();
    const file=await download;const saved=JSON.parse(fs.readFileSync(await file.path(),'utf8'));
    assert.equal(saved.documents[0].fields.bolNumber.value,'BOL-129');
    assert.equal(saved.corrections[0].sourceQuote,'BOL-123');
    assert.equal(saved.corrections[0].trainingEligible,false);
    assert.equal(saved.documents[0].fields.documentDate.value,'2026-08-18');
    assert.equal(saved.corrections[1].sourceQuote,null);
    assert.equal(saved.corrections[1].sourcePage.pageNumber,1);
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
    await review.getByRole('button',{name:'Confirm value',exact:true}).click();
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
    await review.getByRole('button',{name:'Confirm value',exact:true}).click();
    await warning.waitFor({state:'hidden'});
    await review.getByText('118.25',{exact:true}).waitFor();
    // Split names recover with corroboration; a clear crop still needs human
    // confirmation when an earlier pass contains a different carrier.
    await page.goto(new URL('/_not-found',page.url()).href);
    await page.evaluate(async()=>{
      localStorage.clear();
      await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase('owner-op-road-ready-offline-v1');request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Previous fixture database is still open'));});
    });
    await seed(page,state);
    await page.evaluate(()=>{window.__ownedReaderParty=true;window.__ownedReaderCalls=0;});
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'party-recovery.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photo)});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
    await review.getByText('1 items to check',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__ownedReaderCalls),4,'one targeted party crop follows three whole-page passes');
    await review.getByRole('button',{name:'EXAMPLE MILLS, · Page 1',exact:true}).click();
    await review.getByText('Adjacent company suffix:',{exact:false}).waitFor();
    assert.equal(await review.getByLabel('Confirmed value',{exact:true}).inputValue(),'EXAMPLE MILLS, LLC #218');
    await review.getByRole('button',{name:'Close source',exact:true}).click();
    const partyDownload=page.waitForEvent('download');
    await review.getByRole('button',{name:'Export reading review',exact:true}).click();
    const partyFile=await partyDownload,partyResult=JSON.parse(fs.readFileSync(await partyFile.path(),'utf8'));
    assert.equal(partyResult.documents[0].fields.shipper.status,'supported');
    assert.equal(partyResult.documents[0].fields.carrier.status,'needs_review');
    assert.equal(partyResult.documents[0].fields.carrier.candidates.length,2);
    assert.equal(partyResult.documents[0].canAutoFile,false);
    await review.getByRole('button',{name:'Fix next reading',exact:true}).click();
    await review.getByRole('heading',{name:'Carrier · Page 1',exact:true}).waitFor();
    assert.equal(await review.getByLabel('Confirmed value',{exact:true}).inputValue(),'TOTAL QUALITY LOGISTICS','clearest exact-image reread opens first');
    await review.getByRole('button',{name:'Save & next',exact:true}).click();
    await review.getByText('0 items to check',{exact:true}).waitFor();
    await page.screenshot({path:`${output}/${name}-party-recovery.png`,fullPage:true});
    // Separate labels and wrapped consignee rows get complete source crops.
    await page.goto(new URL('/_not-found',page.url()).href);
    await page.evaluate(async()=>{
      localStorage.clear();
      await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase('owner-op-road-ready-offline-v1');request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Previous fixture database is still open'));});
    });
    await seed(page,state);
    await page.evaluate(lines=>{window.__ownedReaderBlock=lines;window.__ownedReaderBlockRead=0;window.__ownedReaderCalls=0;},partyBlocksInput().pages[0].observations.map(o=>o.lines));
    const blockPhoto=await page.evaluate(async lines=>{
      const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1000;
      const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,1000);ctx.fillStyle='black';
      for(const line of lines){ctx.font=`${line.box.height*1000}px Arial`;ctx.fillText(line.text,line.box.x*1000,(line.box.y+line.box.height)*1000,line.box.width*1000);}
      return [...new Uint8Array(await(await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95))).arrayBuffer())];
    },partyBlocksInput().pages[0].observations[0].lines);
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'shipping-blocks.jpg',mimeType:'image/jpeg',buffer:Buffer.from(blockPhoto)});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
    await review.getByText('1 items to check',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__ownedReaderCalls),5);
    const blockDownload=page.waitForEvent('download');
    await review.getByRole('button',{name:'Export reading review',exact:true}).click();
    const blockFile=await blockDownload,blockResult=JSON.parse(fs.readFileSync(await blockFile.path(),'utf8'));
    assert.equal(blockResult.documents[0].fields.shipper.status,'supported');
    assert.equal(blockResult.documents[0].fields.carrier.value,'EXAMPLE TRANSPORT');
    assert.equal(blockResult.documents[0].fields.consignee.candidates.length,1);
    assert.equal(blockResult.documents[0].fields.consignee.issues.includes('conflicting_reads'),false);
    assert.equal(blockResult.documents[0].canAutoFile,false);
    await review.getByRole('button',{name:'Check Consignee source',exact:true}).click();
    await review.getByRole('heading',{name:'Consignee · Page 1',exact:true}).waitFor();
    await review.getByText('Additional company line:',{exact:false}).waitFor();
    await review.getByLabel('Additional source line highlight',{exact:true}).waitFor();
    await visibleHighlight('Source line highlight',false);await visibleHighlight('Additional source line highlight',false);
    assert.ok((await review.getByLabel('Source line highlight',{exact:true}).boundingBox()).height>=17,'already-cropped sources open at a readable text size');
    await review.locator('.owned-reader-inspect').screenshot({path:`${output}/${name}-wrapped-source.png`});
    assert.equal(await review.getByLabel('Confirmed value',{exact:true}).inputValue(),'REGIONAL MARKET / TOWN DEPOT #1-2');
    await review.getByRole('button',{name:'Save & next',exact:true}).click();
    await review.getByText('0 items to check',{exact:true}).waitFor();
    await page.screenshot({path:`${output}/${name}-shipping-blocks.png`,fullPage:true});
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
    await review.getByRole('button',{name:'Confirm value',exact:true}).click();
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
    // A mixed packet must keep three page identities and all amounts in their own document.
    await page.goto(new URL('/_not-found',page.url()).href);
    await page.evaluate(async()=>{
      localStorage.clear();
      await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase('owner-op-road-ready-offline-v1');request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Previous fixture database is still open'));});
    });
    await seed(page,state);
    const packet=noisyPageInput().pages.map(p=>p.observations.map(o=>o.lines));
    packet[2]=mergedReceiptInput().pages[0].observations.map(o=>o.lines);
    packet[0][0].push({text:'SHIP FROM Bill of Lading Number: B-22',confidence:.95,box:{x:.05,y:.10,width:.85,height:.012}});
    packet[1][0].push({text:'CARRIER: Example Logistics SALES ORDER: ORDER-778',confidence:.95,box:{x:.04,y:.18,width:.90,height:.012}},
      {text:'FROM: Northern Foods DELIVERY: DELIVERY-321',confidence:.95,box:{x:.04,y:.20,width:.90,height:.012}});
    packet[2][0].push({text:'Trailer No: T-700 Restacks: 0',confidence:.95,box:{x:.12,y:.45,width:.65,height:.012}});
    const packetPhotos=await page.evaluate(async pages=>{
      window.__ownedReaderPacket=pages;window.__ownedReaderPacketPage=-1;
      const photos=[];
      for(const observations of pages){
        const lines=observations[0];
        const canvas=document.createElement('canvas');canvas.width=700;canvas.height=1000;
        const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,700,1000);ctx.fillStyle='black';
        for(const line of lines){ctx.font=`${Math.max(1,line.box.height*1000)}px Arial`;ctx.fillText(line.text,line.box.x*700,(line.box.y+line.box.height)*1000,line.box.width*700);}
        photos.push([...new Uint8Array(await(await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95))).arrayBuffer())]);
      }
      return photos;
    },packet);
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles(packetPhotos.map((photo,i)=>({name:`packet-${i+1}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(photo)})));
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await review.getByText('3 pages · 3 documents',{exact:true}).waitFor();
    for(const title of ['Bill of lading · 1','Bill of lading · 2','Unloading receipt · 3'])await review.getByRole('heading',{name:title,exact:true}).waitFor();
    assert.equal(await review.getByRole('button',{name:/SALES ORDER:|DELIVERY:|Restacks:/}).count(),0,'neighboring columns cannot enter a field value');
    assert.equal(await page.locator('.scan-evidence-value-v11038').count(),0,'mixed packet has no aggregate field guesses');
    const receiptCheck=review.getByText('Unloading amount plus fee matches the receipt total.',{exact:true});
    await receiptCheck.waitFor();
    await review.getByRole('button',{name:'$185.00 · Page 3',exact:true}).click();
    await review.getByRole('img',{name:'Source image for page 3',exact:true}).waitFor();
    const receiptTop=await review.getByLabel('Source line highlight',{exact:true}).evaluate(el=>parseFloat(el.style.top));
    assert.ok(Math.abs(receiptTop-64)<.2,'receipt value highlights its source on the third page');
    await review.locator('.owned-reader-inspect').screenshot({path:`${output}/${name}-packet-source.png`});
    await review.getByLabel('Confirmed value',{exact:true}).fill('195.00');
    await review.getByRole('button',{name:'Confirm value',exact:true}).click();
    const receiptWarning=review.getByText('Unloading amount plus fee does not match the receipt total. Check the amounts.',{exact:true});
    await receiptWarning.waitFor();
    await review.getByRole('button',{name:'$5.00 · Page 3',exact:true}).click();
    await review.getByLabel('Confirmed value',{exact:true}).fill('15.00');
    await review.getByRole('button',{name:'Confirm value',exact:true}).click();
    await receiptWarning.waitFor({state:'hidden'});await receiptCheck.waitFor();
    const packetDownload=page.waitForEvent('download');
    await review.getByRole('button',{name:'Export reading review',exact:true}).click();
    const packetFile=await packetDownload,packetResult=JSON.parse(fs.readFileSync(await packetFile.path(),'utf8'));
    assert.deepEqual(packetResult.documents.map(d=>d.kind),['bol','bol','unloading_receipt']);
    assert.ok(packetResult.documents.slice(0,2).every(d=>d.identityStatus==='needs_review'),'noisy and combined type evidence stays reviewable');
    assert.equal(packetResult.documents[2].identityStatus,'supported','explicit receipt evidence survives merged OCR rows');
    assert.equal(await review.getByRole('button',{name:/Bill of Lading Number:/}).count(),0,'a form label cannot be offered as a company');
    assert.ok(packetResult.pageIdentities[1].evidence.some(v=>v.method==='combined_observations'),'the UI combines clues from retries of the same page');
    assert.equal(packetResult.documents[2].fields.total.value,'195.00');
    assert.equal(packetResult.documents[2].fields.fee.value,'15.00');
    assert.ok(packetResult.documents.slice(0,2).every(d=>!d.fields.total&&!d.fields.gross));
    assert.ok(packetResult.corrections.every(c=>!c.trainingEligible));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'mixed review fits the phone viewport');
    await page.screenshot({path:`${output}/${name}-packet-review.png`,fullPage:true});
    await page.getByRole('button',{name:'Back',exact:true}).click();
    assert.equal(await page.locator('.scan-page-list-v328 li').count(),3,'all three original pages survive packet review');
    // A generic OCR pass cannot erase a matching lumper identity. Clear,
    // corroborated fee columns must keep their source highlights and export.
    await page.goto(new URL('/_not-found',page.url()).href);
    await page.evaluate(async()=>{localStorage.clear();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('owner-op-road-ready-offline-v1');r.onsuccess=resolve;r.onerror=()=>reject(r.error);});});
    await seed(page,state);
    const columnPhoto=await page.evaluate(async observations=>{
      window.__ownedReaderPacket=[observations];window.__ownedReaderPacketPage=-1;
      const canvas=document.createElement('canvas');canvas.width=700;canvas.height=1000;
      const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,700,1000);ctx.fillStyle='black';
      for(const line of observations[0]){ctx.font=`${Math.max(1,line.box.height*1000)}px Arial`;ctx.fillText(line.text,line.box.x*700,(line.box.y+line.box.height)*1000,line.box.width*700);}
      return [...new Uint8Array(await(await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95))).arrayBuffer())];
    },receiptColumnsInput().pages[0].observations.map(o=>o.lines));
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'receipt-columns.jpg',mimeType:'image/jpeg',buffer:Buffer.from(columnPhoto)});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
    await review.getByRole('heading',{name:'Unloading receipt · 1',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'lumper_receipt','filing type agrees with source review');
    await review.getByText('Unloading amount plus fee matches the receipt total.',{exact:true}).waitFor();
    await review.getByRole('button',{name:'$10.00 · Page 1',exact:true}).click();
    await review.getByRole('heading',{name:'Checkout fee · Page 1',exact:true}).waitFor();
    await review.getByLabel('Source line highlight',{exact:true}).waitFor();
    const feeTop=await review.getByLabel('Source line highlight',{exact:true}).evaluate(el=>parseFloat(el.style.top));
    assert.ok(Math.abs(feeTop-59.5)<.3,'checkout fee highlights its own row');
    await review.getByRole('button',{name:'Close source',exact:true}).click();
    const columnDownload=page.waitForEvent('download');
    await review.getByRole('button',{name:'Export reading review',exact:true}).click();
    const columnFile=await columnDownload,columnResult=JSON.parse(fs.readFileSync(await columnFile.path(),'utf8')),columnDoc=columnResult.documents[0];
    assert.equal(columnDoc.kind,'unloading_receipt');
    assert.equal(columnDoc.fields.fee.value,'10.00');assert.equal(columnDoc.fields.fee.status,'supported');
    assert.equal(columnDoc.fields.total.value,'398.00');assert.equal(columnDoc.fields.poNumber.value,'PO-51');
    assert.equal(columnDoc.fields.trailerNumber.value,'T-700');assert.equal(columnDoc.canAutoFile,false);
    await review.screenshot({path:`${output}/${name}-receipt-columns.png`});
    console.log('PASS '+name+' lumper classification, checkout fee columns, exact source highlight and exported evidence');
    // A fourth, bounded identifier read must retain the complete source page.
    await page.goto(new URL('/_not-found',page.url()).href);
    await page.evaluate(async()=>{localStorage.clear();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('owner-op-road-ready-offline-v1');r.onsuccess=resolve;r.onerror=()=>reject(r.error);});});
    await seed(page,state);
    const detailPhoto=await page.evaluate(async()=>{
      window.__ownedReaderIdentifier=true;
      window.__ownedReaderLines=['BILL OF LADING','B/L NO.','Ship From: Example Shipper','Ship To: Example Receiver','BODY MUST SURVIVE'];
      const canvas=document.createElement('canvas');canvas.width=700;canvas.height=1000;
      const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,700,1000);ctx.fillStyle='black';ctx.font='24px Arial';
      // The source contains digits that all three whole-page OCR stubs miss.
      window.__ownedReaderLines.forEach((line,i)=>ctx.fillText(i===1?line+' 00991234':line,30,64+i*65));
      return [...new Uint8Array(await(await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95))).arrayBuffer())];
    });
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'identifier-source.jpg',mimeType:'image/jpeg',buffer:Buffer.from(detailPhoto)});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    const openDetail=page.getByRole('button',{name:'Reader preview · Check source',exact:true});
    await openDetail.waitFor();await openDetail.click();
    await review.getByText('1 page · 1 document',{exact:true}).waitFor();
    await review.getByRole('button',{name:'00991234 · Page 1',exact:true}).click();
    const detailImage=review.getByRole('img',{name:'Source image for page 1',exact:true});await detailImage.waitFor();
    assert.ok(await detailImage.evaluate(el=>el.naturalWidth<1000&&el.naturalHeight<200),'identifier inspection shows the small source crop');
    await review.getByRole('button',{name:'Close source',exact:true}).click();
    const detailDownload=page.waitForEvent('download');await review.getByRole('button',{name:'Export reading review',exact:true}).click();
    const detailExport=JSON.parse(fs.readFileSync(await(await detailDownload).path(),'utf8'));
    assert.equal(detailExport.pageCount,1);assert.equal(detailExport.pages[0].observations.length,4);
    assert.ok(detailExport.pages[0].observations[0].lines.some(l=>l.text==='BODY MUST SURVIVE'));
    const detailField=detailExport.documents[0].fields.bolNumber;assert.equal(detailField.value,null);assert.ok(detailField.issues.includes('label_needs_review'));
    assert.ok(detailField.candidates[0].evidence[0].sourceImageId.endsWith('1-identifier-detail'));
    await page.getByRole('button',{name:'Back',exact:true}).click();
    assert.equal(await page.locator('.scan-page-list-v328 li').count(),1);
    // A joined document lets a missing field cite its actual later page.
    await page.goto(new URL('/_not-found',page.url()).href);
    await page.evaluate(async()=>{localStorage.clear();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('owner-op-road-ready-offline-v1');r.onsuccess=resolve;r.onerror=()=>reject(r.error);});});
    await seed(page,state);
    const joinedPhotos=await page.evaluate(async()=>{
      const texts=['BILL OF LADING','BOL No: JOINED-345','Ship From: Example Sender','Ship To: Example Receiver'];
      const rows=texts.map((text,i)=>({text,confidence:.96,box:{x:.05,y:.04+i*.065,width:.65,height:.024}}));
      window.__ownedReaderPacket=[[rows],[rows]];window.__ownedReaderPacketPage=-1;
      const photos=[];
      for(let n=1;n<=2;n++){
        const canvas=document.createElement('canvas');canvas.width=700;canvas.height=1000;const ctx=canvas.getContext('2d');
        ctx.fillStyle='white';ctx.fillRect(0,0,700,1000);ctx.fillStyle='black';ctx.font='24px Arial';
        texts.forEach((text,i)=>ctx.fillText(text,35,64+i*65));if(n===2)ctx.fillText('DATE: 2026-08-18',35,350);
        photos.push([...new Uint8Array(await(await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95))).arrayBuffer())]);
      }return photos;
    });
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles(joinedPhotos.map((bytes,i)=>({name:`joined-${i+1}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(bytes)})));
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    const joinedOpen=page.getByRole('button',{name:'Reader preview · Check source',exact:true});
    await page.locator('.owned-reader-preview').waitFor();if(await joinedOpen.isVisible())await joinedOpen.click();
    await review.getByText('2 pages · 1 document',{exact:true}).waitFor();
    await review.getByRole('button',{name:'Enter ship date from page',exact:true}).click();
    await review.getByLabel('Source page',{exact:true}).selectOption('page-2');
    await review.getByRole('img',{name:'Source image for page 2',exact:true}).waitFor();
    await review.getByLabel('Confirmed value',{exact:true}).fill('2026-08-18');
    await review.getByRole('button',{name:'Confirm value',exact:true}).click();
    const joinedDownload=page.waitForEvent('download');await review.getByRole('button',{name:'Export reading review',exact:true}).click();
    const joinedExport=JSON.parse(fs.readFileSync(await(await joinedDownload).path(),'utf8'));
    assert.equal(joinedExport.corrections[0].sourcePage.pageNumber,2);
    assert.ok(joinedExport.corrections[0].sourcePage.sourceImageId.includes('page-2:'));
    assert.equal(joinedExport.documents.length,1);assert.equal(joinedExport.pageCount,2);
    // Unknown pages can be typed and corrected, then persist beside their original.
    await page.goto(new URL('/_not-found',page.url()).href);
    await page.evaluate(async()=>{localStorage.clear();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('owner-op-road-ready-offline-v1');r.onsuccess=resolve;r.onerror=()=>reject(r.error);});});
    await seed(page,state);
    await page.evaluate(()=>{window.__ownedReaderLines=['Unclear heading','Unclear source text'];});
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'unknown-source.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photo)});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
    await review.getByRole('button',{name:'Choose document type',exact:true}).click();
    await review.getByLabel('Document type in reader',{exact:true}).selectOption('bol');
    await review.getByRole('button',{name:'Save & next',exact:true}).click();
    await review.getByRole('heading',{name:'BOL number · Page 1',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'bol');
    assert.equal(await page.getByLabel('Load folder',{exact:true}).inputValue(),'','manual type recovery does not assign a load');
    await review.getByLabel('Confirmed value',{exact:true}).fill('MANUAL-345');
    await review.getByRole('button',{name:'Save & next',exact:true}).click();
    await review.getByRole('heading',{name:'Shipper · Page 1',exact:true}).waitFor();
    await review.getByRole('button',{name:'Skip for now',exact:true}).click();
    await review.getByRole('heading',{name:'Consignee · Page 1',exact:true}).waitFor();
    await review.getByRole('button',{name:'Close source',exact:true}).click();
    const saveCheck=page.locator('.scan-driver-check-v105 input');if(await saveCheck.count())await saveCheck.check();
    await page.getByRole('button',{name:/^Save document$|^Save for review$/}).click();
    await page.locator('.scan-saved-v105').waitFor();
    await page.getByText('Reviewed document details',{exact:true}).click();
    await page.getByText('MANUAL-345',{exact:true}).waitFor();
    await page.reload();
    const storedReview=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('documents_local','readonly'),q=tx.objectStore('documents_local').getAll();tx.oncomplete=()=>{resolve(q.result.map(row=>row.extracted?.readerReviewV110345).find(Boolean));db.close();};};}));
    assert.equal(storedReview.documents[0].fields.bolNumber.value,'MANUAL-345');
    assert.deepEqual(storedReview.documents[0].pages,[1]);
    assert.equal(storedReview.trainingEligible,false);assert.ok(storedReview.remaining>0);
    await page.getByRole('button',{name:/^Documents/}).first().click();
    await page.getByRole('heading',{name:'Recent documents',exact:true}).waitFor();
    const recentReview=page.getByRole('region',{name:'Recent documents'});
    await recentReview.locator('.saved-document-row-v344').first().click();
    await recentReview.getByText('Reviewed document details',{exact:true}).click();
    await recentReview.getByText('MANUAL-345',{exact:true}).waitFor();
    await recentReview.screenshot({path:`${output}/${name}-saved-corrections.png`});
    // The explicit Carrier invoice choice uses the real application catalog ID.
    await page.goto(new URL('/_not-found',page.url()).href);
    await page.evaluate(async()=>{localStorage.clear();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('owner-op-road-ready-offline-v1');r.onsuccess=resolve;r.onerror=()=>reject(r.error);});});
    await seed(page,state);await page.evaluate(()=>{window.__ownedReaderLines=['Unreadable invoice header'];});
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'invoice-recovery.jpg',mimeType:'image/jpeg',buffer:Buffer.from(invoicePhoto)});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
    await review.getByRole('button',{name:'Choose document type',exact:true}).click();
    await review.getByLabel('Document type in reader',{exact:true}).selectOption({label:'Carrier invoice'});
    await review.getByRole('button',{name:'Save & next',exact:true}).click();
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'load_invoice');
    await review.getByRole('heading',{name:'Invoice number · Page 1',exact:true}).waitFor();
    // Exercise the wider catalog through real intake, review, source opening
    // and export, with deterministic OCR and ordinary mobile browser storage.
    const catalogSamples=[['rate_confirmation','PRO # 86420 Rate Confirmation\nTOTAL RATE 2300.00\nPICK 1\n123 EXAMPLE RD Appointment 09/17/26 08:00 to 09/17/26 16:00\nALBANY NY 12207\nSTOP 1\nEXAMPLE RECEIVING LLC\n456 SAMPLE ST Appointment 09/22/26 08:00 to 09/22/26 16:00\nMADISON WI 53703',{loadNumber:'86420',totalRate:'2300.00'}],
      ...truckingCases.filter(c=>['pod','fuel_receipt','scale_ticket','repair_invoice','packing_list','certificate_of_insurance'].includes(c[0])).map(([kind,title,body,expected])=>[kind,title+'\n'+body,expected]),
      ['invoice','INVOICE\nInvoice No: HOTEL-440\nSubtotal $100.00\nTotal $100.00\nCurrency: USD',{invoiceNumber:'HOTEL-440'}]];
    for(const [kind,text,expected] of catalogSamples){
      await page.goto(new URL('/_not-found',page.url()).href);
      await page.evaluate(async()=>{localStorage.clear();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('owner-op-road-ready-offline-v1');r.onsuccess=resolve;r.onerror=()=>reject(r.error);});});
      await seed(page,state);
      const bytes=await page.evaluate(async text=>{
        const lines=text.split('\n');window.__ownedReaderLines=lines;
        const canvas=document.createElement('canvas');canvas.width=700;canvas.height=1000;
        const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,700,1000);ctx.fillStyle='black';ctx.font='24px Arial';
        lines.forEach((line,i)=>ctx.fillText(line,30,64+i*65));
        return [...new Uint8Array(await(await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95))).arrayBuffer())];
      },text);
      await page.getByRole('button',{name:/Smart Scan/}).first().click();
      await page.locator('input[type=file][multiple]').first().setInputFiles({name:'catalog-'+kind+'.jpg',mimeType:'image/jpeg',buffer:Buffer.from(bytes)});
      await page.getByRole('button',{name:'Read document',exact:true}).click();
      const open=page.getByRole('button',{name:'Reader preview · Check source',exact:true});
      await page.locator('.owned-reader-preview').waitFor();if(await open.isVisible())await open.click();
      await review.getByText('1 page · 1 document',{exact:true}).waitFor();
      const download=page.waitForEvent('download');await review.getByRole('button',{name:'Export reading review',exact:true}).click();
      const result=JSON.parse(fs.readFileSync(await(await download).path(),'utf8'));
      assert.equal(result.documents[0].kind,kind);
      assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),kind==='invoice'?'other':kind);
      for(const [key,value] of Object.entries(expected))assert.equal(result.documents[0].fields[key].value,value,kind+': '+key);
      if(kind==='rate_confirmation'){
        const fields=result.documents[0].fields;
        assert.equal(fields.consignee.candidates[0].value,'EXAMPLE RECEIVING LLC');
        assert.equal(fields.consignee.status,'needs_review');
        assert.equal(fields.pickupDate.candidates[0].rawValue,'09/17/26');
        assert.equal(fields.deliveryDate.candidates[0].rawValue,'09/22/26');
      }
      const value=Object.values(expected)[0];
      await review.getByRole('button',{name:value+' · Page 1',exact:true}).first().click();
      await review.getByRole('img',{name:'Source image for page 1',exact:true}).waitFor();
      await review.getByLabel('Source line highlight',{exact:true}).first().waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
      if(['rate_confirmation','pod','fuel_receipt'].includes(kind))await review.screenshot({path:`${output}/${name}-catalog-${kind}.png`});
    }
    // Unrelated signing envelopes leave the primary reading visible, show
    // the page warning, and require an explicit load-folder decision.
    await page.goto(new URL('/_not-found',page.url()).href);
    await page.evaluate(async()=>{localStorage.clear();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('owner-op-road-ready-offline-v1');r.onsuccess=resolve;r.onerror=()=>reject(r.error);});});
    await seed(page,state);
    const attachmentPhotos=await page.evaluate(async texts=>{
      window.__ownedReaderPacket=texts.map(text=>[text.split('\n').map((text,i)=>({text,confidence:.96,box:{x:.04,y:.04+i*.065,width:.92,height:.024}}))]);
      window.__ownedReaderPacketPage=-1;const photos=[];
      for(const text of texts){
        const canvas=document.createElement('canvas');canvas.width=700;canvas.height=1000;const ctx=canvas.getContext('2d');
        ctx.fillStyle='white';ctx.fillRect(0,0,700,1000);ctx.fillStyle='black';ctx.font='24px Arial';
        text.split('\n').forEach((line,i)=>ctx.fillText(line,30,64+i*65));
        photos.push([...new Uint8Array(await(await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95))).arrayBuffer())]);
      }return photos;
    },[catalogSamples[0][1]+'\nDocument Ref: PACKET-SOURCE-REF Page 1 of 2','SIGNATURE PAGE\nDocument Ref: OTHER-SOURCE-REF Page 2 of 2']);
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles(attachmentPhotos.map((bytes,i)=>({name:`attachment-${i+1}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(bytes)})));
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByText(/Check that signature attachments on pages 2 belong to this document/).first().waitFor();
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'rate_confirmation');
    assert.equal(await page.getByLabel('Load folder',{exact:true}).inputValue(),'');
    await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
    await review.getByText('2 pages · 2 documents',{exact:true}).waitFor();
    await review.getByRole('button',{name:'86420 · Page 1',exact:true}).click();
    await review.getByRole('img',{name:'Source image for page 1',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('PASS '+name+' owned reader: page evidence, source image, correction, export and original retained');
  }catch(error){
    await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});
    const failure={error:String(error),pageErrors:errors,body:await page.locator('body').innerText().catch(()=>''),url:page.url()};
    fs.writeFileSync(`${output}/${name}-failure.txt`,JSON.stringify(failure,null,2));
    console.error('Owned reader fixture failure:',JSON.stringify(failure));
    throw error;
  }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
