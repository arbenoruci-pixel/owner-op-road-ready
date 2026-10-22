// Real native-PDF intake with isolated fixture accounts; AI is never billed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
import {contractRateInput} from '../../packages/smart-reader-core/test/contract-rate-fixture.mjs';

const output='browser-test-results/contract-rate';fs.mkdirSync(output,{recursive:true});
let buffer;
if(process.env.CONTRACT_RATE_PDF)buffer=fs.readFileSync(process.env.CONTRACT_RATE_PDF);
else{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  for(const input of contractRateInput().pages){
    const page=pdf.addPage([612,792]),lines=input.observations[0].lines;
    for(const [index,line]of lines.entries()){
      const footer=index===lines.length-1,size=Math.min(10,510/font.widthOfTextAtSize(line.text,1));
      page.drawText(line.text,{x:40,y:footer?35:750-index*24,size,font});
    }
  }
  buffer=Buffer.from(await pdf.save());
}
for(const [name,browser]of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.TEST_BROWSER||process.env.TEST_BROWSER===name)){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'contract-rate-'));
  const context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],aiCalls=[];page.setDefaultTimeout(45000);page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().includes('/api/reader/classify'))aiCalls.push(request.url());});
  try{
    await setupRoutes(context);
    const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};await seed(page,state);
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'carrier-contract.pdf',mimeType:'application/pdf',buffer});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
    const review=page.locator('.owned-reader-preview');
    await review.getByRole('heading',{name:'Rate confirmation · 1, 2, 3',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'rate_confirmation');
    const [download]=await Promise.all([page.waitForEvent('download'),review.getByRole('button',{name:'Export reading review',exact:true}).click()]);
    const result=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    assert.equal(result.documents.length,1);assert.equal(result.documents[0].kind,'rate_confirmation');
    assert.equal(result.documents[0].reference,process.env.CONTRACT_RATE_REFERENCE||'654321-0');
    assert.equal(result.documents[0].fields.totalRate.value,'4400.00');assert.equal(result.documents[0].canAutoFile,false);
    assert.deepEqual(aiCalls,[],'source-supported contract pages do not need paid AI calls');assert.deepEqual(errors,[]);
    await page.screenshot({path:`${output}/${name}-contract.png`,fullPage:true});
    console.log(`PASS ${name}: native three-page contract → RateCon selector, one document, exact reference/total, zero AI requests`);
  }catch(error){
    await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});
    fs.writeFileSync(`${output}/${name}-failure.txt`,JSON.stringify({error:String(error),errors,aiCalls,body:await page.locator('body').innerText()},null,2));throw error;
  }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
