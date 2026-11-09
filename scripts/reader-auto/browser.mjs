// Synthetic, loopback-only end-to-end checks. Every account/API write is blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {origin,baseState,seed,setupRoutes,snapshot,protectedData} from '../v110434/browserFixture.mjs';
import {homeControl} from '../test-support/dashboard-navigation.mjs';
import {createAiReaderHandlers} from '../../lib/reader-ai/server.js';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname));
fs.mkdirSync('browser-test-results/reader-auto',{recursive:true});
const engine=process.env.READER_AUTO_BROWSER||'chromium';
const lines=['BILL OF LADING','BOL No: B-4321','SHIP FROM: EXAMPLE MILL','SHIP TO: EXAMPLE MARKET','Carrier: EXAMPLE FREIGHT','Date: 11/04/2026','Weight: 1000 LB'];
const readings={kind:'bol',quality:'readable',mixed:false,delivery:'pickup_only',fields:Object.entries({bolNumber:'B-4321',shipper:'EXAMPLE MILL',consignee:'EXAMPLE MARKET',carrier:'EXAMPLE FREIGHT',documentDate:'11/04/2026',weight:'1000 LB'}).map(([field,value])=>({field,value,quote:field+': '+value,location:'top',clear:true}))};
const otherReadings={
 rate:{kind:'rate_confirmation',values:{loadNumber:'9001',totalRate:'$2500.00',pickupDate:'11/04/2026',shipper:'EXAMPLE MILL',consignee:'EXAMPLE MARKET'}},
 invoice:{kind:'invoice',values:{invoiceNumber:'INV-123',vendor:'EXAMPLE WAREHOUSE',invoiceDate:'11/04/2026',total:'$250.00'}},
 unloading:{kind:'unloading_receipt',values:{receiptNumber:'L-123',poNumber:'PO-7401',receiptDate:'11/04/2026',amount:'$240.00',fee:'$10.00',total:'$250.00'}}
};
for(const scenario of (process.env.READER_AUTO_CASES||'automatic,pod,shipment,rate,invoice,unloading,ambiguous,wrong_image,unavailable,pipeline,manual_type').split(',')){
 const browser=await ({chromium,webkit})[engine].launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
 try{
  await setupRoutes(context);await context.route('https://cdn.jsdelivr.net/**',r=>r.abort('blockedbyclient'));
  let calls=0,providerCalls=0,startRead;
  const started=new Promise(resolve=>{startRead=resolve;});
  const other=otherReadings[scenario];
  const pageReading=other?{kind:other.kind,quality:'readable',mixed:false,delivery:'none',fields:Object.entries(other.values).map(([field,value])=>({field,value,quote:field+': '+value,location:'top',clear:true}))}:scenario==='pod'?{...readings,kind:'pod',delivery:'receiver_stamped',fields:[...readings.fields,{field:'deliveryDate',value:'11/06/2026',quote:'Received 11/06/2026',location:'middle',clear:true}]}:readings;
  const api=createAiReaderHandlers({env:()=>({READER_AI_ENABLED:'true',READER_AI_GATEWAY_KEY:'synthetic',READER_AI_MODEL:'example/vision'}),authorize:async()=> 'fixture-user',fetcher:async()=>{
    providerCalls++;
    if(scenario==='pipeline')await new Promise(resolve=>setTimeout(resolve,1500));
    if(scenario==='unavailable')return Response.json({error:'unavailable'},{status:503});
    const providerReading=scenario==='shipment'?providerCalls===1?{...readings,delivery:'uncertain'}:{...readings,kind:'pod',delivery:'receiver_stamped',fields:[...readings.fields,{field:'deliveryDate',value:'11/06/2026',quote:'Received 11/06/2026',location:'bottom',clear:true}]}:pageReading;
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(providerReading)}}]});
  }});
  await context.route('**/api/reader/classify',async route=>{
   const req=route.request(),method=req.method();
   if(method==='POST'){const input=req.postDataJSON();assert.equal(input.operation,'read');calls++;startRead();}
   const request=new Request('https://app.test/api/reader/classify',{method,headers:req.headers(),...(method==='POST'?{body:req.postData()}: {})});
   const response=await api[method](request),value=await response.json();
   if(scenario==='wrong_image'&&value.result)value.result.imageHash='0'.repeat(64);
   return route.fulfill({status:response.status,json:value});
  });
  await context.addInitScript(({lines})=>{
   window.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async file=>{
    const bmp=await createImageBitmap(file),w=bmp.width,h=bmp.height;bmp.close();
    const tsv=['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',[1,1,0,0,0,0,0,0,w,h,-1,''].join('\t'),...lines.map((s,i)=>[5,1,i+1,1,1,1,w*.06,h*(.07+i*.11),w*.85,h*.03,96,s].join('\t'))].join('\n');
    return {data:{text:lines.join('\n'),confidence:96,tsv}};
   }})};
  },{lines});
  const state=baseState(),load={id:'load-fixture',source:'rate_confirmation',loadNo:'9001',broker:'Example Broker',origin:'Example City, IL',destination:'Example Town, IN',pickupDate:'2026-11-04',aliases:[{kind:'bol_number',value:'B-4321'},{kind:'po_number',value:'PO-7401'}]};
  state.testInstructionStore={loads:[load,...(['ambiguous','manual_type'].includes(scenario)?[{...load,id:'second-load',loadNo:'9002'}]:[])],documents:[],expenses:[],fuel:[],maintenance:[],settlements:[]};
  await seed(page,state);const before=protectedData(await snapshot(page));
  const displayLines=otherReadings[scenario]?[otherReadings[scenario].kind,...Object.entries(otherReadings[scenario].values).map(([k,v])=>k+': '+v)]:scenario==='pod'?[...lines,'Received by EXAMPLE MARKET 11/06/2026']:lines;
  const bytes=await page.evaluate(lines=>{const c=document.createElement('canvas');c.width=1200;c.height=1600;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,c.width,c.height);g.fillStyle='black';g.font='32px sans-serif';lines.forEach((s,i)=>g.fillText(s,72,160+i*160));return c.toDataURL('image/png').split(',')[1];},displayLines);
  const original=Buffer.from(bytes,'base64');
  await (await homeControl(page,'Smart Scan')).click();
  await page.locator('input[type=file][multiple]').first().setInputFiles({name:'synthetic-auto-bol.png',mimeType:'image/png',buffer:original});
  await page.getByRole('button',{name:'Read document',exact:true}).click();
  if(scenario==='pipeline'){await started;await page.getByText('Reading and checking the original…',{exact:true}).waitFor();assert.equal(await page.getByRole('combobox',{name:'Document type',exact:true}).count(),0,'manual form must wait for the verified reading');}
  if(['automatic','pod','shipment','rate','invoice','unloading','pipeline'].includes(scenario)){
   await page.getByText(scenario==='shipment'?'FILED TO LOAD · DELIVERY STAMP UNVERIFIED':'READ, CHECKED AND FILED',{exact:true}).waitFor({timeout:60000});
   const store=await page.evaluate(()=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')));
   assert.equal(store.documents.length,1);const saved=store.documents[0];
   assert.equal(saved.canonicalLoadNo,scenario==='invoice'?'':'9001');assert.equal(saved.documentDate,scenario==='pod'?'2026-11-06':'2026-11-04');assert.equal(saved.type,({pod:'pod',rate:'rate_confirmation',invoice:'other',unloading:'lumper_receipt'})[scenario]||'bol');assert.equal(saved.status,'verified');
   assert.equal(saved.confirmationOrigin,'machine');assert.equal(saved.linkToLogbook,false);assert.equal(saved.automaticFilingV1.origin,'machine');
   if(['automatic','pod','shipment'].includes(scenario))assert.equal(saved.extracted.readerSourceFieldsV110393.fields.bolNo.value,'B-4321');
   if(scenario==='invoice')assert.equal(saved.folder,'documents');
   if(scenario==='shipment'){
    assert.equal(saved.automaticFilingV1.deliveryStatus,'unverified');
    assert.equal(saved.automaticFilingV1.filingScope,'shipment_document');
    assert.equal(saved.extracted.readerSourceFieldsV110393.fields.deliveryDate,undefined);
    assert.deepEqual(store.loads,state.testInstructionStore.loads,'filing BOL must not complete or change the load');
   }
   if(scenario==='rate')assert.equal(saved.extracted.gross,'2500.00');
   if(['invoice','unloading'].includes(scenario))assert.equal(saved.extracted.total,'250.00');
   const stored=await page.evaluate(async()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction(['document_blobs','capture_asset_blobs']),qs=['document_blobs','capture_asset_blobs'].map(t=>tx.objectStore(t).getAll());let count=0;for(const q of qs)q.onsuccess=async()=>{if(++count!==2)return;const rows=[];for(const row of qs.flatMap(q=>q.result)){const blob=row.blob,bytes=blob?.arrayBuffer?await blob.arrayBuffer():blob?.bytes;if(bytes)rows.push(Array.from(new Uint8Array(bytes)));}db.close();resolve(rows);};};}));
   assert.ok(stored.some(b=>Buffer.from(b).equals(original)),'original bytes remain identical');
   await page.reload();assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')))).documents.length,1);
  }else{
   await page.getByRole('region',{name:'Automatic reading for Bill of lading'}).waitFor({timeout:60000});
   if(['ambiguous','manual_type'].includes(scenario))await page.getByText('Read and checked automatically',{exact:true}).waitFor();
   else await page.getByRole('button',{name:'Read again',exact:true}).waitFor();
   const store=await page.evaluate(()=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')));assert.equal(store.documents.length,0);
  }
  if(scenario==='manual_type'){await page.getByRole('combobox',{name:'Document type',exact:true}).selectOption('pod');await page.getByRole('region',{name:'Key details for Bill of lading'}).waitFor();await page.waitForTimeout(500);assert.equal(providerCalls,2,'changing review type must reuse the completed read');}
  assert.equal(calls,1);assert.equal(providerCalls,2);assert.deepEqual(protectedData(await snapshot(page)),before);assert.deepEqual(errors,[]);
  await page.screenshot({path:`browser-test-results/reader-auto/${engine}-${scenario}.png`,fullPage:true});
  console.log(`PASS ${engine} ${scenario}: verified reading, original preservation, folder boundary and unchanged duty records`);
 }catch(error){await page.screenshot({path:`browser-test-results/reader-auto/${engine}-${scenario}-failure.png`,fullPage:true});fs.writeFileSync(`browser-test-results/reader-auto/${engine}-${scenario}-failure.txt`,await page.locator('body').innerText()+'\nERRORS '+JSON.stringify(errors));throw error;}finally{await browser.close();}
}
