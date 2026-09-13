import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes} from './v110328/browserFixture.mjs';

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
      const lines=['BILL OF LADING','BOL No: BOL-123','Ship From: Example Shipper','Ship To: Example Receiver','Weight: 12000 LB'];
      window.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async()=>{
        window.__ownedReaderCalls++;
        const rows=['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext'];
        lines.forEach((line,i)=>{let x=30;line.split(' ').forEach((word,j)=>{rows.push(`5\t1\t1\t1\t${i+1}\t${j+1}\t${x}\t${40+i*65}\t${word.length*10}\t24\t96\t${word}`);x+=word.length*10+12;});});
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
    assert.deepEqual(errors,[]);
    console.log('PASS '+name+' owned reader: page evidence, source image, correction, export and original retained');
  }catch(error){
    await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});
    fs.writeFileSync(`${output}/${name}-failure.txt`,JSON.stringify({error:String(error),pageErrors:errors,body:await page.locator('body').innerText().catch(()=>''),url:page.url()},null,2));
    throw error;
  }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
