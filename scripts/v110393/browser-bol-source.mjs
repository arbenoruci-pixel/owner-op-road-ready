// Full intake, source review, export and persistence with anonymized OCR data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
import {bolSourceInput} from '../../packages/smart-reader-core/test/bol-source-fixture.mjs';

const output='browser-test-results/bol-source-v110393';fs.mkdirSync(output,{recursive:true});
const observations=bolSourceInput().pages[0].observations.slice(0,3).map(o=>o.lines);
for(const [name,browser]of [['chromium',chromium],['webkit',webkit]]){
  const instance=await browser.launch({headless:true});
  const context=await instance.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
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
    const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};await seed(page,state);
    const bytes=await page.evaluate(lines=>{
      const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=2000;
      const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='black';
      for(const line of lines){c.font=`${Math.max(12,line.box.height*2000)}px sans-serif`;c.fillText(line.text,line.box.x*1500,(line.box.y+line.box.height)*2000,line.box.width*1500);}
      return canvas.toDataURL('image/png').split(',')[1];
    },observations[1]);
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'bol-source.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
    const review=page.locator('.owned-reader-preview');
    await review.getByRole('heading',{name:'Bill of lading · 1',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'bol');
    await review.getByRole('button',{name:'0012345678 · Page 1',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Check source',exact:true});await dialog.waitFor();
    assert.equal(await dialog.getByLabel('Confirmed value',{exact:true}).inputValue(),'0012345678');
    const top=await dialog.getByLabel('Source line highlight',{exact:true}).evaluate(el=>parseFloat(el.style.top));
    assert.ok(Math.abs(top-9.6)<.3,'BOL source points at the actual header number');
    await dialog.screenshot({path:`${output}/${name}-header.png`});
    await dialog.getByRole('button',{name:'Close source',exact:true}).click();
    const [download]=await Promise.all([page.waitForEvent('download'),review.getByRole('button',{name:'Export reading review',exact:true}).click()]);
    const result=JSON.parse(fs.readFileSync(await download.path(),'utf8')),doc=result.documents[0];
    assert.equal(result.engineVersion,'0.3.27');assert.equal(doc.reference,'0012345678');assert.equal(doc.canAutoFile,false);
    for(const [key,value]of Object.entries({bolNumber:'0012345678',shipper:'NORTHERN FOODS',consignee:'REGIONAL MARKET / TOWN DEPOT NORTH',carrier:'J AND K TRANSPORT',trailerNumber:'8042',poNumber:'24681357',documentDate:'2026-07-14',temperature:'-10 F'})){
      assert.equal(doc.fields[key].status,'supported',key);assert.equal(doc.fields[key].value,value,key);
    }
    assert.equal(doc.fields.weight.status,'needs_review');assert.ok(doc.fields.weight.issues.includes('weight_unit_required'));
    assert.ok(result.pages[0].observations.some(o=>o.lines.some(l=>l.text==='NO.: 0012345678')));
    await review.getByRole('button',{name:'0012345678 · Page 1',exact:true}).click();
    await dialog.getByRole('button',{name:'Confirm value',exact:true}).click();
    const check=page.locator('.scan-driver-check-v105 input');if(await check.count())await check.check();
    await page.getByRole('button',{name:/^Save document$|^Save for review$/}).click();
    await page.locator('.scan-saved-v105').waitFor();
    await page.reload();
    const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{
      const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result,tx=db.transaction('documents_local','readonly'),rows=tx.objectStore('documents_local').getAll();
        tx.oncomplete=()=>{resolve(rows.result.map(row=>row.extracted?.readerReviewV110345).find(Boolean));db.close();};};
    }));
    assert.equal(saved.documents[0].fields.bolNumber.value,'0012345678');assert.deepEqual(errors,[]);
    console.log(`PASS ${name} BOL header, eight supported fields, exact source, export and confirmed-number persistence`);
  }catch(error){
    await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});
    fs.writeFileSync(`${output}/${name}-failure.txt`,JSON.stringify({error:String(error),errors,body:await page.locator('body').innerText().catch(()=>''),url:page.url()},null,2));
    throw error;
  }finally{await context.close();await instance.close();}
}
