// Synthetic, loopback-only end-to-end checks. Every account/API write is blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {origin,baseState,seed,setupRoutes,snapshot,protectedData} from '../v110434/browserFixture.mjs';
import {homeControl} from '../test-support/dashboard-navigation.mjs';
import {SMART_READING_VERSION,reconcileSmartReadings} from '../../lib/reader-ai/smartReading.js';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname));
fs.mkdirSync('browser-test-results/reader-auto',{recursive:true});
const engine=process.env.READER_AUTO_BROWSER||'chromium';
const lines=['BILL OF LADING','BOL No: B-4321','SHIP FROM: EXAMPLE MILL','SHIP TO: EXAMPLE MARKET','Carrier: EXAMPLE FREIGHT','Date: 11/04/2026','Weight: 1000 LB'];
const readings={kind:'bol',quality:'readable',mixed:false,delivery:'pickup_only',fields:Object.entries({bolNumber:'B-4321',shipper:'EXAMPLE MILL',consignee:'EXAMPLE MARKET',carrier:'EXAMPLE FREIGHT',documentDate:'11/04/2026',weight:'1000 LB'}).map(([field,value])=>({field,value,quote:field+': '+value,location:'top',clear:true}))};
for(const scenario of (process.env.READER_AUTO_CASES||'automatic,ambiguous,wrong_image,unavailable').split(',')){
 const browser=await ({chromium,webkit})[engine].launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
 try{
  await setupRoutes(context);await context.route('https://cdn.jsdelivr.net/**',r=>r.abort('blockedbyclient'));
  let calls=0;
  await context.route('**/api/reader/classify',async route=>{
   if(route.request().method()==='GET')return route.fulfill({json:{enabled:true,model:'example/vision',smartReading:{enabled:true,version:SMART_READING_VERSION,passes:2}}});
   const input=route.request().postDataJSON();assert.equal(input.operation,'read');calls++;
   if(scenario==='unavailable')return route.fulfill({status:503,json:{ok:false,error:'unavailable'}});
   const imageHash=createHash('sha256').update(Buffer.from(input.image.split(',')[1],'base64')).digest('hex');
   return route.fulfill({json:{ok:true,pageNumber:1,result:{...reconcileSmartReadings(readings,readings),model:'example/vision',imageHash:scenario==='wrong_image'?'0'.repeat(64):imageHash,checkedAt:'2026-11-09T00:00:00Z'}}});
  });
  await context.addInitScript(({lines})=>{
   window.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async file=>{
    const bmp=await createImageBitmap(file),w=bmp.width,h=bmp.height;bmp.close();
    const tsv=['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',[1,1,0,0,0,0,0,0,w,h,-1,''].join('\t'),...lines.map((s,i)=>[5,1,i+1,1,1,1,w*.06,h*(.07+i*.11),w*.85,h*.03,96,s].join('\t'))].join('\n');
    return {data:{text:lines.join('\n'),confidence:96,tsv}};
   }})};
  },{lines});
  const state=baseState(),load={id:'load-fixture',loadNo:'LOAD-9001',broker:'Example Broker',origin:'Example City, IL',destination:'Example Town, IN',pickupDate:'2026-11-04',aliases:[{kind:'bol_number',value:'B-4321'}]};
  state.testInstructionStore={loads:[load,...(scenario==='ambiguous'?[{...load,id:'second-load',loadNo:'LOAD-9002'}]:[])],documents:[],expenses:[],fuel:[],maintenance:[],settlements:[]};
  await seed(page,state);const before=protectedData(await snapshot(page));
  const bytes=await page.evaluate(lines=>{const c=document.createElement('canvas');c.width=1200;c.height=1600;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,c.width,c.height);g.fillStyle='black';g.font='32px sans-serif';lines.forEach((s,i)=>g.fillText(s,72,160+i*160));return c.toDataURL('image/png').split(',')[1];},lines);
  const original=Buffer.from(bytes,'base64');
  await (await homeControl(page,'Smart Scan')).click();
  await page.locator('input[type=file][multiple]').first().setInputFiles({name:'synthetic-auto-bol.png',mimeType:'image/png',buffer:original});
  await page.getByRole('button',{name:'Read document',exact:true}).click();
  if(scenario==='automatic'){
   await page.getByText('READ, CHECKED AND FILED',{exact:true}).waitFor({timeout:60000});
   const store=await page.evaluate(()=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')));
   assert.equal(store.documents.length,1);const saved=store.documents[0];
   assert.equal(saved.canonicalLoadNo,'LOAD-9001');assert.equal(saved.documentDate,'2026-11-04');assert.equal(saved.status,'verified');
   assert.equal(saved.confirmationOrigin,'machine');assert.equal(saved.linkToLogbook,false);assert.equal(saved.automaticFilingV1.origin,'machine');
   assert.equal(saved.extracted.readerSourceFieldsV110393.fields.bolNo.value,'B-4321');
   const stored=await page.evaluate(async()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('document_blobs').objectStore('document_blobs').getAll();q.onsuccess=async()=>{const rows=[];for(const row of q.result){const blob=row.blob,bytes=blob?.arrayBuffer?await blob.arrayBuffer():blob?.bytes;if(bytes)rows.push(Array.from(new Uint8Array(bytes)));}db.close();resolve(rows);};};}));
   assert.ok(stored.some(b=>Buffer.from(b).equals(original)),'original bytes remain identical');
   await page.reload();assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')))).documents.length,1);
  }else{
   await page.getByRole('region',{name:'Automatic reading for Bill of lading'}).waitFor({timeout:60000});
   if(scenario==='ambiguous')await page.getByText('Read and checked automatically',{exact:true}).waitFor();
   else await page.getByRole('button',{name:'Read again',exact:true}).waitFor();
   const store=await page.evaluate(()=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')));assert.equal(store.documents.length,0);
  }
  assert.equal(calls,1);assert.deepEqual(protectedData(await snapshot(page)),before);assert.deepEqual(errors,[]);
  await page.screenshot({path:`browser-test-results/reader-auto/${engine}-${scenario}.png`,fullPage:true});
  console.log(`PASS ${engine} ${scenario}: verified reading, original preservation, folder boundary and unchanged duty records`);
 }catch(error){await page.screenshot({path:`browser-test-results/reader-auto/${engine}-${scenario}-failure.png`,fullPage:true});fs.writeFileSync(`browser-test-results/reader-auto/${engine}-${scenario}-failure.txt`,await page.locator('body').innerText()+'\nERRORS '+JSON.stringify(errors));throw error;}finally{await browser.close();}
}
