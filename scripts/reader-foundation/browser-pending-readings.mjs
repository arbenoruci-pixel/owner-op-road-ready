// Synthetic local-only browser regression. No real account or original is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
import {bolWeightColumnsInput} from '../../packages/smart-reader-core/test/bol-weight-columns-fixture.mjs';
const output='browser-test-results/pending-reader';fs.mkdirSync(output,{recursive:true});
const lines=bolWeightColumnsInput().pages[0].observations[0].lines;
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'reader-pending-'));
const context=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',
 ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const page=await context.newPage(),errors=[];page.setDefaultTimeout(45000);page.on('pageerror',error=>errors.push(error.message));
try{
 await setupRoutes(context);
 await context.addInitScript(lines=>{window.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async file=>{
  const bitmap=await createImageBitmap(file),width=bitmap.width,height=bitmap.height;bitmap.close();
  const tsv=['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
   [1,1,0,0,0,0,0,0,width,height,-1,''].join('\t'),...lines.map((line,i)=>[5,1,i+1,1,1,1,
    Math.round(line.box.x*width),Math.round(line.box.y*height),Math.max(1,Math.round(line.box.width*width)),Math.max(1,Math.round(line.box.height*height)),line.confidence*100,line.text].join('\t'))];
  return {data:{text:lines.map(l=>l.text).join('\n'),confidence:96,tsv:tsv.join('\n')}};
 }})};},lines);
 const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};await seed(page,state);
 const bytes=await page.evaluate(lines=>{const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=2000;
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1500,2000);ctx.fillStyle='black';
  for(const line of lines){ctx.font=`${Math.max(12,line.box.height*2000)}px sans-serif`;ctx.fillText(line.text,line.box.x*1500,(line.box.y+line.box.height)*2000,line.box.width*1500);}
  return canvas.toDataURL('image/png').split(',')[1];},lines);
 await page.getByRole('button',{name:/Smart Scan/}).first().click();
 await page.locator('input[type=file][multiple]').first().setInputFiles({name:'sanitized-weight-table.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});
 await page.getByRole('button',{name:'Read document',exact:true}).click();
 await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
 const review=page.locator('.owned-reader-preview');await review.getByRole('heading',{name:'Bill of lading · 1',exact:true}).waitFor();
 const pending=page.getByRole('region',{name:'Readings needing confirmation',exact:true});await pending.waitFor();
 for(const text of ['Example Printer','Example Receiver','31,246','10-08-26','Not confirmed','weight unit','full year and month/day order'])assert.ok((await pending.innerText()).includes(text),text);
 assert.equal(await page.locator('.reader-analysis-summary').evaluate(node=>node.open),false,'pending readings do not require opening the disclosure');
 const before=await pending.innerText();
 await review.getByRole('button',{name:'31,246 · Page 1',exact:true}).first().click();
 const dialog=page.getByRole('dialog',{name:'Check source',exact:true});await dialog.waitFor();
 await dialog.getByRole('button',{name:'Close source',exact:true}).click();
 assert.equal(await pending.innerText(),before,'cancel does not confirm a reading');
 for(const [raw,value] of [['Example Printer','Example Printer'],['Example Receiver','Example Receiver'],['10-08-26','2026-10-08'],['31,246','31246 LB']]){
  await review.getByRole('button',{name:raw+' · Page 1',exact:true}).first().click();await dialog.waitFor();
  await dialog.getByLabel('Confirmed value',{exact:true}).fill(value);
  await dialog.getByRole('button',{name:'Confirm value',exact:true}).click();await dialog.waitFor({state:'hidden'});
 }
 assert.equal(await pending.count(),0,'explicit confirmations clear the pending display');
 const check=page.locator('.scan-driver-check-v105 input');if(await check.count())await check.check();
 await page.getByRole('button',{name:/^Save document$|^Save for review$/}).click();await page.locator('.scan-saved-v105').waitFor();await page.reload();
 const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);request.onsuccess=()=>{
  const db=request.result,tx=db.transaction('documents_local','readonly'),q=tx.objectStore('documents_local').getAll();tx.oncomplete=()=>{resolve(q.result.find(row=>row.extracted?.readerAnalysisV1));db.close();};};}));
 const snapshot=saved.extracted.readerAnalysisV1,fields=snapshot.groups[0].fields;
 assert.equal(fields.shipper.value,'Example Printer');assert.equal(fields.consignee.value,'Example Receiver');assert.equal(fields.weight.value,'31246 LB');assert.equal(fields.documentDate.value,'2026-10-08');
 for(const key of ['shipper','consignee','weight','documentDate'])assert.equal(fields[key].status,'confirmed');
 assert.equal(snapshot.autoFile,false);assert.equal(snapshot.selection.loadNo,'');assert.deepEqual(errors,[]);
 console.log('PASS Chromium: pending source readings → cancel unchanged → explicit confirmations → save/reload; no automatic load assignment');
}catch(error){await page.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});fs.writeFileSync(output+'/failure.json',JSON.stringify({error:String(error),errors,body:await page.locator('body').innerText()},null,2));throw error;}
finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
