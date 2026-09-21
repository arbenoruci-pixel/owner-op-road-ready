// Full intake, source review, export and persistence with anonymized OCR data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
import {shortFormInput,damagedUnitInput} from '../../packages/smart-reader-core/test/bol-form-fixture.mjs';

const output='browser-test-results/bol-form-v110394';fs.mkdirSync(output,{recursive:true});
for(const [caseName,input,expectedWeight]of [['short-form',shortFormInput(),'20188 LB'],['damaged-unit',damagedUnitInput(),'2377.44 LB']]){
const observations=input.pages[0].observations.map(o=>o.lines);
for(const [name,browser]of [['chromium',chromium],['webkit',webkit]]){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bol-form-'));
  const context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(45000);page.on('pageerror',error=>errors.push(error.message));
  try{
    await setupRoutes(context);
    await context.addInitScript(observations=>{
      let read=0;
      window.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async file=>{
        const bitmap=await createImageBitmap(file),width=bitmap.width,height=bitmap.height;bitmap.close();
        const lines=observations[Math.min(read++,observations.length-1)];
        const tsv=['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
          [1,1,0,0,0,0,0,0,width,height,-1,''].join('\t'),
          ...lines.map((line,i)=>[5,1,i+1,1,1,1,Math.round(line.box.x*width),Math.round(line.box.y*height),
            Math.max(1,Math.round(line.box.width*width)),Math.max(1,Math.round(line.box.height*height)),line.confidence*100,line.text].join('\t'))];
        return {data:{text:lines.map(l=>l.text).join('\n'),confidence:96,tsv:tsv.join('\n')}};
      }})};
    },observations);
    const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};await seed(page,state);
    const bytes=await page.evaluate(lines=>{
      const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=2000;
      const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='black';
      for(const line of lines){c.font=`${Math.max(12,line.box.height*2000)}px sans-serif`;c.fillText(line.text,line.box.x*1500,(line.box.y+line.box.height)*2000,line.box.width*1500);}
      return canvas.toDataURL('image/png').split(',')[1];
    },observations[1]);
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'bol-form.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
    const review=page.locator('.owned-reader-preview');
    await review.getByRole('heading',{name:'Bill of lading · 1',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'bol');
    const checks=page.getByRole('region',{name:'Document reading checks',exact:true});
    assert.equal(await checks.getByText('BOL number was not verified from its label. Check the original.',{exact:true}).count(),1);
    await page.getByRole('button',{name:/^Extracted details/}).click();
    const displayed=page.locator('.scan-details-v105 > div');
    await displayed.getByText(expectedWeight,{exact:true}).waitFor();
    await page.getByRole('button',{name:/^Extracted details/}).click();
    await review.getByRole('button',{name:caseName==='short-form'?'20,188 · Page 1':'2377.44 Ibs · Page 1',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Check source',exact:true});await dialog.waitFor();
    assert.equal(await dialog.getByLabel('Confirmed value',{exact:true}).inputValue(),expectedWeight);
    const top=await dialog.getByLabel('Source line highlight',{exact:true}).evaluate(el=>parseFloat(el.style.top));
    assert.ok(Math.abs(top-(caseName==='short-form'?39.7:45.7))<.3,'weight source points at its own total row');
    if(caseName==='short-form')await dialog.getByText('Weight unit:',{exact:false}).waitFor();
    await dialog.screenshot({path:`${output}/${name}-${caseName}-weight.png`});
    await dialog.getByRole('button',{name:'Close source',exact:true}).click();
    const [download]=await Promise.all([page.waitForEvent('download'),review.getByRole('button',{name:'Export reading review',exact:true}).click()]);
    const result=JSON.parse(fs.readFileSync(await download.path(),'utf8')),doc=result.documents[0];
    assert.equal(result.engineVersion,'0.3.28');assert.equal(doc.kind,'bol');assert.equal(doc.canAutoFile,false);
    assert.equal(doc.fields.weight.status,'supported');assert.equal(doc.fields.weight.value,expectedWeight);
    if(caseName==='damaged-unit'){
      assert.equal(doc.fields.totalUnits.value,'4');assert.equal(doc.fields.carrier.value,null);
      assert.equal(doc.fields.bolNumber.value,null);assert.ok(doc.fields.bolNumber.issues.includes('identifier_fragments'));
      assert.ok(result.pages[0].observations.some(o=>o.lines.some(l=>l.text.includes('2377.44 Ibs'))));
    }else{
      assert.equal(doc.fields.carrier.value,'SUPPLY CHAIN SOLUTIO');assert.equal(doc.fields.poNumber.value,'246810-002');
      assert.ok(doc.fields.weight.candidates.some(c=>c.continuationEvidence?.some(e=>e.quote==='LB')));
    }
    const check=page.locator('.scan-driver-check-v105 input');if(await check.count())await check.check();
    await page.getByRole('button',{name:/^Save document$|^Save for review$/}).click();
    await page.locator('.scan-saved-v105').waitFor();
    await page.reload();
    const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{
      const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result,tx=db.transaction('documents_local','readonly'),rows=tx.objectStore('documents_local').getAll();
        tx.oncomplete=()=>{resolve(rows.result.map(row=>row.extracted).find(extracted=>extracted?.readerReviewV110345));db.close();};};
    }));
    assert.equal(saved.weight,expectedWeight);assert.equal(saved.readerSourceFieldsV110393.fields.weight.status,'supported');
    assert.equal(saved.readerReviewV110345.documents[0].fields.weight.value,expectedWeight);
    if(caseName==='damaged-unit'){assert.equal(saved.totalUnits,'4');assert.equal(saved.carrierName,undefined);assert.equal(saved.bolNo,undefined);}
    assert.deepEqual(errors,[]);
    console.log(`PASS ${name} ${caseName}: classification, displayed weight, exact source, export and saved fields`);
  }catch(error){
    await page.screenshot({path:`${output}/${name}-${caseName}-failure.png`,fullPage:true}).catch(()=>{});
    fs.writeFileSync(`${output}/${name}-${caseName}-failure.txt`,JSON.stringify({error:String(error),errors,body:await page.locator('body').innerText().catch(()=>''),url:page.url()},null,2));
    throw error;
  }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
}
