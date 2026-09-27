// Full intake, source review, export and persistence with anonymized OCR data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
import {columnBolInput} from '../../packages/smart-reader-core/test/bol-columns-fixture.mjs';

const output='browser-test-results/document-filing-v110411';fs.mkdirSync(output,{recursive:true});
const observations=columnBolInput().pages[0].observations.slice(0,3).map(o=>[...o.lines,{text:'Received by: Sam Sample',box:{x:.48,y:.82,width:.3,height:.016},confidence:.98}]);
for(const [name,browser]of [['chromium',chromium],['webkit',webkit]]){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bol-columns-'));
  const context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(45000);page.on('pageerror',error=>errors.push(error.message));
  try{
    await setupRoutes(context);
    await context.addInitScript(observations=>{
      let read=0;
      window.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async file=>{
        const bitmap=await createImageBitmap(file),width=bitmap.width,height=bitmap.height;bitmap.close();
        const lines=observations[Math.min(read++,2)];
        const tsv=['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
          [1,1,0,0,0,0,0,0,width,height,-1,''].join('\t'),
          ...lines.map((line,i)=>[5,1,i+1,1,1,1,Math.round(line.box.x*width),Math.round(line.box.y*height),
            Math.max(1,Math.round(line.box.width*width)),Math.max(1,Math.round(line.box.height*height)),line.confidence*100,line.text].join('\t'))];
        return {data:{text:lines.map(l=>l.text).join('\n'),confidence:96,tsv:tsv.join('\n')}};
      }})};
    },observations);
    await page.clock.setFixedTime(new Date('2026-09-25T18:00:00Z'));
    const state=baseState();state.view='logbook';state.activeDay='2026-09-25';
    state.eventsByDay={'2026-09-24':[{id:'real-pickup',status:'ON',startMin:1000,endMin:1030,reasons:['Pickup / Loading'],source:'manual',shippingDocs:'00654321',city:'Kingfield',state:'ME'}]};
    state.routeLegsByDay={'2026-09-24':[{id:'real-leg',pickupEventId:'real-pickup',day:'2026-09-24',shippingDocs:'00654321',fromCity:'Kingfield',fromState:'ME',toCity:'Rockleigh',toState:'NJ',status:'open'}]};
    state.loadInfo={};state.testInstructionStore={loads:[{source:'rate_confirmation_v105',loadNo:'00654321',status:'active'},{source:'rate_confirmation_v105',loadNo:'OTHER1234',status:'booked'}],documents:[]};await seed(page,state);
    assert.equal(await page.locator('.adaptive-mission-v1038 h1').innerText(),'00654321');
    assert.equal(await page.getByText('Pickup BOL missing',{exact:true}).count(),1);
    const bytes=await page.evaluate(lines=>{
      const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=2000;
      const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='black';
      for(const line of lines){c.font=`${Math.max(12,line.box.height*2000)}px sans-serif`;c.fillText(line.text,line.box.x*1500,(line.box.y+line.box.height)*2000,line.box.width*1500);}
      return canvas.toDataURL('image/png').split(',')[1];
    },observations[1]);
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'bol-columns.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
    const review=page.locator('.owned-reader-preview');
    await review.getByRole('heading',{name:'Proof of delivery · 1',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'pod');
    assert.equal(await page.getByLabel('Load folder',{exact:true}).inputValue(),'00654321','Reader source reference refreshes the folder suggestion');
    const checks=page.getByRole('region',{name:'Document reading checks',exact:true});
    assert.equal(await checks.getByText('BOL number was not verified from its label. Check the original.',{exact:true}).count(),0);
    await page.getByRole('button',{name:/^Extracted details/}).click();
    const displayed=page.locator('.scan-details-v105 > div');
    await displayed.getByText('00654321',{exact:true}).waitFor();
    await page.getByRole('button',{name:/^Extracted details/}).click();
    await review.getByRole('button',{name:'00654321 · Page 1',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Check source',exact:true});await dialog.waitFor();
    assert.equal(await dialog.getByLabel('Confirmed value',{exact:true}).inputValue(),'00654321');
    const top=await dialog.getByLabel('Source line highlight',{exact:true}).evaluate(el=>parseFloat(el.style.top));
    assert.ok(Math.abs(top-10.8)<.3,'BOL source points at the actual header number');
    await dialog.screenshot({path:`${output}/${name}-header.png`});
    await dialog.getByRole('button',{name:'Close source',exact:true}).click();
    const [download]=await Promise.all([page.waitForEvent('download'),review.getByRole('button',{name:'Export reading review',exact:true}).click()]);
    const result=JSON.parse(fs.readFileSync(await download.path(),'utf8')),doc=result.documents[0];
    assert.equal(result.engineVersion,'0.3.36');assert.equal(doc.reference,'00654321');assert.equal(doc.canAutoFile,false);
    assert.equal(doc.fields.poNumber.value,'PO-87654');
    assert.equal(doc.fields.shipper.value,null);assert.equal(doc.fields.consignee.value,null);
    assert.deepEqual(doc.fields.shipper.candidates.map(c=>c.value),['Northern Water Inc']);
    assert.deepEqual(doc.fields.consignee.candidates.map(c=>c.value),['Example Market']);
    assert.ok(doc.fields.carrier.issues.includes('conflicting_reads'));
    for(const value of ['Northern Water Inc','Example Market']){
      const choice=value==='Northern Water Inc'?'OTHER1234':'';await page.getByLabel('Load folder',{exact:true}).selectOption(choice);
      await page.getByLabel('Document date',{exact:true}).fill('2026-09-23');
      await review.getByRole('button',{name:value+' · Page 1',exact:true}).click();
      await dialog.waitFor();
      assert.equal(await dialog.getByLabel('Confirmed value',{exact:true}).inputValue(),value);
      await dialog.getByRole('button',{name:'Confirm value',exact:true}).click();
      await dialog.waitFor({state:'hidden'});
      assert.equal(await page.getByLabel('Load folder',{exact:true}).inputValue(),choice,'Source confirmation preserves manual folder choice');
      assert.equal(await page.getByLabel('Document date',{exact:true}).inputValue(),'2026-09-23','Source confirmation preserves a manually edited date');
    }
    await page.getByLabel('Load folder',{exact:true}).selectOption('00654321');
    await page.getByLabel('Document date',{exact:true}).fill('2026-09-24');
    const check=page.locator('.scan-driver-check-v105 input');if(await check.count())await check.check();
    await page.getByRole('button',{name:/^Save document$|^Save for review$/}).click();
    await page.locator('.scan-saved-v105').waitFor();
    await page.reload();
    await page.locator('.adaptive-home-v1038, .logbook-home-screen-v988').first().waitFor();
    if(!await page.locator('.adaptive-home-v1038').isVisible())await page.getByRole('button',{name:/Home/i}).first().click();
    await page.locator('.adaptive-home-v1038').waitFor();
    assert.equal(await page.locator('.adaptive-mission-v1038 h1').innerText(),'00654321');
    assert.equal(await page.getByText('Pickup BOL missing',{exact:true}).count(),0,'Saved POD covers current load BOL after reload without a duty link');
    const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{
      const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result,tx=db.transaction('documents_local','readonly'),rows=tx.objectStore('documents_local').getAll();
        tx.oncomplete=()=>{resolve(rows.result.map(row=>row.extracted).find(extracted=>extracted?.readerReviewV110345));db.close();};};
    }));
    assert.equal(saved.canonicalLoadNo,'00654321');assert.equal(saved.linkToLogbook,false);
    assert.equal(saved.bolNo,'00654321');assert.equal(saved.poNumber,'PO-87654');
    assert.equal(saved.shipper,'Northern Water Inc');assert.equal(saved.consignee,'Example Market');
    assert.equal(saved.readerSourceFieldsV110393.fields.bolNo.status,'supported');
    assert.equal(saved.readerSourceFieldsV110393.fields.shipper.status,'confirmed');
    assert.equal(saved.readerSourceFieldsV110393.fields.consignee.status,'confirmed');
    assert.equal(saved.readerReviewV110345.documents[0].fields.shipper.value,'Northern Water Inc');
    assert.equal(saved.readerReviewV110345.documents[0].fields.consignee.value,'Example Market');assert.deepEqual(errors,[]);
    console.log(`PASS ${name} POD reference rematch, manual folder choices, save/reload and Home BOL coverage`);
  }catch(error){
    await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});
    fs.writeFileSync(`${output}/${name}-failure.txt`,JSON.stringify({error:String(error),errors,body:await page.locator('body').innerText().catch(()=>''),url:page.url()},null,2));
    throw error;
  }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
