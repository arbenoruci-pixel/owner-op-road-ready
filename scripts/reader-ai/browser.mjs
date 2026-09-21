// Integration fixtures only: AI and OCR are stubbed, never billed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
import {AI_READER_VERSION,validateAiClassification} from '../../lib/reader-ai/policy.js';

const output='browser-test-results/ai-reader';fs.mkdirSync(output,{recursive:true});
const suggestion=validateAiClassification({kind:'pod',certainty:'clear',quality:'readable',mixed:false,delivery:'receiver_signed',evidence:[
  {code:'shipping_structure',quote:'BILL OF LADING',location:'top'},
  {code:'receiver_acknowledgement',quote:'Received by: J. Doe',location:'bottom'},
]});
for(const [name,browser]of [['chromium',chromium],['webkit',webkit]]){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ai-reader-browser-'));
  const context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
  let aiCalls=0;
  try{
    await setupRoutes(context);
    await context.route('**/api/reader/classify',async route=>{
      if(route.request().method()==='GET')return route.fulfill({json:{enabled:true,version:AI_READER_VERSION,model:'example/vision'}});
      const input=route.request().postDataJSON();aiCalls++;
      assert.match(input.image,/^data:image\/jpeg;base64,/);assert.equal(input.pageNumber,1);
      assert.match(route.request().headers().authorization,/^Bearer /);
      assert.equal(input.text.includes('unreadable OCR'),true);
      const imageHash=createHash('sha256').update(Buffer.from(input.image.split(',')[1],'base64')).digest('hex');
      return route.fulfill({json:{ok:true,pageNumber:1,result:{...suggestion,model:'example/vision',imageHash,checkedAt:'2026-09-21T00:00:00Z'}}});
    });
    await context.addInitScript(()=>{
      window.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async()=>({data:{text:'unreadable OCR\nfragmented marks on page',confidence:30,tsv:''}})})};
    });
    const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};await seed(page,state);
    const bytes=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1600;const c=canvas.getContext('2d');
      c.fillStyle='white';c.fillRect(0,0,1200,1600);c.fillStyle='black';c.font='36px sans-serif';
      ['BILL OF LADING','SHIP FROM: EXAMPLE MILL','SHIP TO: EXAMPLE MARKET','Weight: 1200 LB','Received by: J. Doe'].forEach((line,i)=>c.fillText(line,70,180+i*220));
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'delivery-page.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByLabel('AI document check',{exact:true}).getByText(/AI suggests POD/).waitFor();
    assert.equal(aiCalls,1);
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'other','suggestion must not silently change filing type');
    await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
    const review=page.locator('.owned-reader-preview');
    await review.getByRole('button',{name:'Check AI suggestion',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Check source',exact:true});await dialog.waitFor();
    assert.equal(await dialog.getByLabel('Document type in reader').inputValue(),'pod');
    const original=dialog.getByRole('img',{name:'Source image for page 1',exact:true});
    const ink=await original.evaluate(async img=>{
      await img.decode();const canvas=document.createElement('canvas');canvas.width=120;canvas.height=160;
      const c=canvas.getContext('2d');c.drawImage(img,0,0,120,160);const pixels=c.getImageData(0,0,120,160).data;
      let dark=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<160&&pixels[i+1]<160&&pixels[i+2]<160)dark++;
      return dark;
    });
    assert.ok(ink>20,'source confirmation must display the original document ink');
    await dialog.screenshot({path:`${output}/${name}-source-confirmation.png`});
    await dialog.getByRole('button',{name:'Confirm value',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.scan-confirm-v105 select')?.value==='pod');
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'pod');
    const [download]=await Promise.all([page.waitForEvent('download'),review.getByRole('button',{name:'Export reading review',exact:true}).click()]);
    const result=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    assert.equal(result.aiClassification.pages[0].result.kind,'pod');
    assert.equal(result.aiClassification.pages[0].result.verified,false);
    assert.equal(result.documents[0].typeCorrection.origin,'human');
    assert.match(result.documents[0].typeCorrection.sourcePage.sourceImageId,/:original$/);
    assert.equal(result.documents[0].canAutoFile,false);
    assert.equal(result.pages.some(p=>p.observations.some(o=>o.source==='ai')),false,'AI is never injected as OCR');
    assert.deepEqual(errors,[]);
    console.log(`PASS ${name}: automatic image fallback, visible suggestion, original review, human confirmation and exported provenance`);
  }catch(error){await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});throw error;}
  finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
