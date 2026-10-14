import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,snapshot,protectedData} from '../v110434/browserFixture.mjs';
import {selectedLoadFolder} from '../test-support/load-folder-browser.mjs';
const output='browser-test-results/current-load-consistency';fs.mkdirSync(output,{recursive:true});
const loadNo='BROKER-1001',shipperRef='SHIPPER-7001';
function fixture(scenario){
 const state=baseState();state.view='logbook';state.activeDay='2026-10-14';
 state.loadInfo={loadNo,shippingDocs:loadNo,pickupCity:'Example City',pickupState:'ME',deliveryCity:'Example Town',deliveryState:'NE'};
 state.eventsByDay={'2026-10-08':[{id:'pickup',status:'ON',startMin:600,endMin:630,note:'Pickup / Loading',shippingDocs:shipperRef,city:'Example City',state:'ME',source:'manual'}],
  '2026-10-12':[{id:'delivery',status:'ON',startMin:900,endMin:930,note:'Delivery / Unloading',loadNo,shippingDocs:loadNo,city:'Example Town',state:'NE',source:'manual'}]};
 state.routeLegsByDay={'2026-10-08':[{id:'pickup-route',day:'2026-10-08',pickupEventId:'pickup',loadNo:shipperRef,shippingDocs:shipperRef,fromCity:'Example City',fromState:'ME',toCity:'Example Town',toState:'NE',status:'open',source:'pickup_event'}],
  '2026-10-12':[{id:'delivery-route',day:'2026-10-12',deliveryEventId:'delivery',loadNo,shippingDocs:loadNo,status:'delivered',source:'delivery_event'}]};
 state.testInstructionStore={loads:[{id:'broker-load',loadNo,broker:'Example Bay Logistics',status:'booked',source:'rate_confirmation_v105',date:'2026-10-08',pickupDate:'2026-10-08',deliveryDate:'2026-10-12',gross:4000,origin:'Example City, ME',destination:'Example Town, NE'}],
  evidenceAliases:scenario==='unlinked'?[]:[{from:shipperRef,to:loadNo}],documents:[],fuel:[],expenses:[],maintenance:[],settlements:[]};
 return state;
}
async function contrast(locator){
 return locator.evaluate(node=>{
  const rgb=color=>color.match(/[\d.]+/g)?.slice(0,3).map(Number);
  const luminance=color=>rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const color=getComputedStyle(node).color;
  let background='rgb(255,255,255)',parent=node;
  while(parent){const c=getComputedStyle(parent).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){background=c;break;}parent=parent.parentElement;}
  const a=luminance(color),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 });
}
for(const [name,browser] of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.TEST_BROWSERS||process.env.TEST_BROWSERS.split(',').includes(name))){
 for(const scenario of ['in_transit','delivered','unlinked']){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'current-load-'));
  const context=await browser.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
  try{
   await setupRoutes(context);await page.clock.setFixedTime(new Date(scenario==='in_transit'?'2026-10-10T16:00:00Z':'2026-10-14T16:00:00Z'));
   await context.addInitScript(()=>{window.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async file=>{
    const bitmap=await createImageBitmap(file),width=bitmap.width,height=bitmap.height;bitmap.close();
    const lines=['BILL OF LADING','BOL No: DOC-987','Ship From: Example Printer','Ship To: Example Receiver','Ship date: 2026-10-08'];
    const tsv=['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
     [1,1,0,0,0,0,0,0,width,height,-1,''].join('\t'),...lines.map((line,i)=>[5,1,i+1,1,1,1,width*.05,height*(.1+i*.1),width*.85,height*.03,96,line].join('\t'))];
    return {data:{text:lines.join('\n'),confidence:96,tsv:tsv.join('\n')}};
   }})};});
   const state=fixture(scenario);await seed(page,state);const before=protectedData(await snapshot(page));
   if(scenario==='delivered')assert.equal(await page.locator('.adaptive-mission-v1038').count(),0,'completed broker load and its reviewed shipper reference cannot stay active');
   else if(scenario==='unlinked'){
    assert.equal(await page.locator('.adaptive-mission-v1038 h1').innerText(),shipperRef);
    await page.getByText('SHIPMENT REFERENCE',{exact:true}).waitFor();await page.getByText('Check the load link',{exact:true}).waitFor();
    assert.equal(await page.getByText('Pickup BOL missing',{exact:true}).count(),0,'an unresolved reference does not imply a missing document');
   }else assert.equal(await page.locator('.adaptive-mission-v1038 h1').innerText(),loadNo,'Home displays the broker number');
   await page.screenshot({path:`${output}/${name}-${scenario}-home.png`,fullPage:true});
   await page.getByRole('button',{name:'Loads',exact:true}).click();await page.getByText('Business Center',{exact:true}).waitFor();
   const card=page.locator('.business-record-card').filter({hasText:loadNo});
   assert.equal(await card.locator('.business-status').innerText(),scenario==='in_transit'?'IN TRANSIT':'DELIVERED');
   if(scenario==='in_transit'){
    assert.match(await page.locator('.business-import-current').innerText(),new RegExp(loadNo));
    await page.locator('.business-import-current').click();assert.equal(await page.getByLabel('Load #',{exact:true}).inputValue(),loadNo);
    await page.getByRole('button',{name:'Close',exact:true}).click();
   }else assert.equal(await page.locator('.business-import-current').count(),0,'a completed or unlinked reference is never imported as current');
   if(scenario==='unlinked')assert.match(await page.locator('.business-shipment-reference').innerText(),new RegExp(shipperRef));
   for(const width of [390,820]){
    await page.setViewportSize({width,height:1024});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Business Center fits phone and iPad');
    const labels=[page.locator('.business-section-head b'),page.locator('.business-summary-tile b').nth(1),card.locator(':scope > b'),card.locator('.business-record-stats b').first()];
    for(const label of labels)assert.ok(await contrast(label)>=4.5,'load number and financial figures remain readable on light cards');
   }
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${output}/${name}-${scenario}-business.png`,fullPage:true});
   await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Smart Scan',exact:true}).click();
   const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=1400;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,1400);ctx.fillStyle='black';ctx.font='30px sans-serif';['BILL OF LADING','BOL No: DOC-987','Ship From: Example Printer','Ship To: Example Receiver','Ship date: 2026-10-08'].forEach((line,i)=>ctx.fillText(line,50,140*(i+1)));return c.toDataURL('image/png').split(',')[1];});
   await page.locator('input[type=file][multiple]').first().setInputFiles({name:'synthetic-current-load.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
   await page.getByRole('button',{name:'Read document',exact:true}).click();await page.getByRole('button',{name:'Choose load folder',exact:true}).waitFor();
   await page.getByRole('button',{name:'Choose load folder',exact:true}).click();
   const picker=page.getByRole('dialog',{name:'Choose load folder',exact:true}),option=picker.locator('.reader-load-option').filter({hasText:loadNo});
   assert.match(await option.innerText(),scenario==='in_transit'?/Current load/:/Completed/,'filing uses the same operational load state');
   assert.match(await option.innerText(),/Example Bay Logistics/);
   assert.equal(await picker.locator('.reader-load-option').filter({hasText:'Load '+shipperRef}).count(),0,'a shipment reference is never presented as a second broker load');
   const unlinked=picker.locator('.reader-load-option').filter({hasText:'Shipment reference '+shipperRef});
   if(await unlinked.count())assert.equal(await unlinked.isDisabled(),true,'unlinked shipment references cannot silently become filing folders');
   await option.click();assert.equal(await selectedLoadFolder(page),loadNo);
   await page.getByLabel('Document type',{exact:true}).selectOption('pod');await page.getByLabel('Document date',{exact:true}).fill('2026-10-12');
   const confirm=page.locator('.scan-driver-check-v105 input');if(await confirm.count())await confirm.check();
   await page.getByRole('button',{name:/^Save document$|^Save for review$/}).click();await page.locator('.scan-saved-v105').waitFor();
   await page.reload();
   const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('documents_local','readonly'),q=tx.objectStore('documents_local').getAll();tx.oncomplete=()=>{resolve(q.result);db.close();};};}));
   assert.ok(saved.some(row=>row.type==='pod'&&row.load_no===loadNo),'the manual POD is saved to its broker load rather than its BOL reference');
   const afterStore=await page.evaluate(()=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')));
   assert.deepEqual(afterStore.evidenceAliases||[],scenario==='unlinked'?[]:[{from:shipperRef,to:loadNo}],'saving retains the reviewed load link');
   assert.equal(afterStore.loads.length,1,'filing a BOL reference does not create a second broker load');
   assert.equal(Number(afterStore.loads[0].gross),4000,'filing preserves the existing rate');
   if(scenario==='delivered')assert.equal(await page.locator('.adaptive-mission-v1038').count(),0);
   else assert.equal(await page.locator('.adaptive-mission-v1038 h1').innerText(),scenario==='unlinked'?shipperRef:loadNo,'reopening keeps the same current identity');
   assert.deepEqual(protectedData(await snapshot(page)),before,'navigation and view projections preserve duty events, inspections and signatures');
   assert.deepEqual(errors,[]);console.log(`PASS ${name} ${scenario}: shared Home/Business/filing identity, POD save/reload, delivery closeout, phone/iPad contrast and unchanged duty data`);
  }catch(error){await page.screenshot({path:`${output}/${name}-${scenario}-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${name}-${scenario}-failure.json`,JSON.stringify({error:String(error),errors,body:await page.locator('body').innerText()},null,2));throw error;}
  finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
 }
}
