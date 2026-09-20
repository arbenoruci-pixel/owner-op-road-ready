import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {baseState,seed,setupRoutes} from './v110328/browserFixture.mjs';
import {sertifiRateInput} from '../packages/smart-reader-core/test/sertifi-rate-fixture.mjs';
import {resolveEvidence} from '../packages/smart-reader-core/src/index.js';

const output='browser-test-results/ratecon-structure-v110388';fs.mkdirSync(output,{recursive:true});
const expected=process.env.TEST_RATECON_EXPECTED?JSON.parse(fs.readFileSync(process.env.TEST_RATECON_EXPECTED)):{
  loadNumber:'86420',totalRate:'500.00',shipper:'SAMPLE RAIL TERMINAL',consignee:'EXAMPLE RECEIVING LLC',
  pickupDate:'2025-07-12',deliveryDate:'2025-07-14',billingEmail:'billing@example.test'};
let buffer;
if(process.env.TEST_RATECON_FILE)buffer=fs.readFileSync(process.env.TEST_RATECON_FILE);
else{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier),input=sertifiRateInput();
  for(const [index,source] of input.pages.entries()){
    const page=pdf.addPage([612,792]);
    if(index===0){
      for(const line of source.observations[1].lines){const b=line.box;
        page.drawText(line.text,{x:b.x*612,y:792-(b.y+b.height)*792,size:8,font});}
      for(const [i,text] of ['Weight: 36000','- ALL PAGES OF PODs MUST BE TURNED IN WITHIN 48h OF DELIVERY',
        '- Detention paid after 3h at a rate of $30 per hour, not exceeding $150 per 24h'].entries())
        page.drawText(text,{x:30,y:320-i*18,size:8,font});
    }else for(const [i,line] of source.observations[0].lines.entries())
      page.drawText(line.text,{x:30,y:755-i*20,size:9,font});
  }
  buffer=Buffer.from(await pdf.save());
}
for(const [name,browser] of [['chromium',chromium],['webkit',webkit]]){
  const context=await browser.launchPersistentContext('',{headless:true,viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  try{
    await setupRoutes(context);const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};await seed(page,state);
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'rate-confirmation.pdf',mimeType:'application/pdf',buffer});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    const previewToggle=page.getByRole('button',{name:/^Reader preview · (?:Check source|Close)$/});
    await previewToggle.waitFor();
    if(await previewToggle.getAttribute('aria-expanded')!=='true')await previewToggle.click();
    const review=page.locator('.owned-reader-preview');await review.getByText('3 pages · 2 documents',{exact:true}).waitFor();
    assert.equal(await page.getByText('Some pages could not be identified. Check whether these documents belong together.',{exact:true}).count(),0);
    assert.equal(await page.getByText('Separate documents are included. Review the fields under each document; the PDF keeps all pages.',{exact:true}).count(),0);
    const download=page.waitForEvent('download');await review.getByRole('button',{name:'Export reading review',exact:true}).click();
    const result=JSON.parse(fs.readFileSync(await(await download).path(),'utf8')),fields=result.documents[0].fields;
    fs.writeFileSync(`${output}/${name}-review.json`,JSON.stringify(result,null,2));
    assert.equal(result.engineVersion,'0.3.25');assert.equal(result.documents[1].kind,'signing_certificate');
    for(const [key,value] of Object.entries(expected))assert.equal(fields[key].value,value,key);
    assert.deepEqual(result.documents[0].pageIds,['page-1','page-2']);
    assert.equal(fields.deliveryAddress.status,'needs_review');assert.deepEqual(fields.deliveryAddress.issues,['incomplete_address']);
    assert.deepEqual(fields.weight.issues,['weight_unit_required']);assert.equal(result.documents[1].fields.date.value,'2025-07-11');
    for(const doc of result.documents)for(const field of Object.values(doc.fields))for(const c of field.candidates)
      for(const e of [...c.evidence,...c.labelEvidence||[],...c.continuationEvidence||[]])resolveEvidence(result,e);
    await review.getByRole('button',{name:'Check Delivery address source',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Check source',exact:true});await dialog.waitFor();
    assert.equal(await dialog.getByLabel('Confirmed value',{exact:true}).inputValue(),'LINCOLNWOOD IL 60712');
    await dialog.getByLabel('Source line highlight',{exact:true}).waitFor();
    await dialog.screenshot({path:`${output}/${name}-partial-address.png`});
    await dialog.getByRole('button',{name:'Close source',exact:true}).click();
    await review.screenshot({path:`${output}/${name}-reader.png`});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
    assert.deepEqual(errors,[]);console.log(`PASS ${name}: three PDF pages, linked dates, receiver, terms and traceable partial address`);
  }catch(error){
    await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});
    const diagnostic={error:String(error),errors,body:await page.locator('body').innerText()};
    fs.writeFileSync(`${output}/${name}-failure.json`,JSON.stringify(diagnostic,null,2));
    console.error(JSON.stringify(diagnostic));throw error;
  }finally{await context.close();}
}
