import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,snapshot} from '../v110434/browserFixture.mjs';
const csv='Jurisdiction,Distance (mi)\nIllinois,1000\nIndiana,250\nTotal,1250';
const engines=process.env.TEST_BROWSER==='chromium'?[['chromium',chromium]]:[['chromium',chromium],['webkit',webkit]];
const out='browser-test-results/motive-quarterly';fs.mkdirSync(out,{recursive:true});
for(const [name,engine] of engines){
 const browser=await engine.launch({headless:true,...(name==='webkit'&&process.env.WEBKIT_EXECUTABLE?{executablePath:process.env.WEBKIT_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',acceptDownloads:true,timezoneId:'America/Chicago'});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await setupRoutes(context);
 try{
  const state=baseState();state.homeTerminalTimeZone='America/Chicago';state.formByDay={'2026-10-01':{miles:4321}};state.eventsByDay={'2026-10-01':[{id:'exact-event',status:'D',startMin:10,endMin:50,source:'manual'}]};state.signatureByDay={'2026-10-01':{signed:true,signatureDataUrl:'data:image/png;base64,AQID'}};state.certifyStatus={'2026-10-01':'Certified'};state.loadInfo={};state.routeLegsByDay={};state.loadGuidesById={};state.testInstructionStore={loads:[],documents:[],fuel:[],expenses:[],maintenance:[],settlements:[]};
  await seed(page,state,[]);const before=await snapshot(page);
  await page.getByRole('button',{name:'Import',exact:true}).click();
  await page.getByRole('button',{name:'Import Motive miles — IFTA / IRP',exact:true}).click();
  await page.getByLabel('Report year',{exact:true}).fill('2026');await page.getByLabel('Quarter',{exact:true}).selectOption('4');await page.getByLabel('Truck / unit, if absent from CSV',{exact:true}).fill('36');
  const upload=async(body=csv,filename='Motive-distance-summary.csv')=>page.getByLabel('Choose statement or logbook').setInputFiles({name:filename,mimeType:'text/csv',buffer:Buffer.from(body)});
  const review=page.getByRole('region',{name:'Import preview'});
  await upload();await page.getByRole('button',{name:'Review import',exact:true}).click();await review.waitFor();
  assert.match(await review.innerText(),/2026-10-01 → 2026-12-31/);assert.match(await review.innerText(),/1250\.0 miles/);assert.match(await review.innerText(),/Truck: 36/);
  const save=review.getByRole('button',{name:'Save 2 new rows + original',exact:true});assert(await save.isDisabled());await review.getByRole('checkbox').check();await save.click();await page.getByRole('status').filter({hasText:'Saved 2 new rows'}).waitFor();
  await upload(csv,'renamed.csv');await page.getByRole('button',{name:'Review import',exact:true}).click();await review.waitFor();assert.match(await review.innerText(),/2\s+duplicates/);await review.getByRole('checkbox').check();await review.getByRole('button',{name:'Keep statement original',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved 0 new rows'}).waitFor();
  await upload(csv.replace('1000','1100').replace('1250','1350'),'revised.csv');await page.getByRole('button',{name:'Review import',exact:true}).click();await review.waitFor();assert(await review.getByRole('checkbox').isDisabled());await review.getByRole('heading',{name:'Transactions need review'}).waitFor();await review.getByRole('button',{name:'Cancel preview',exact:true}).click();
  await page.getByRole('button',{name:'My month',exact:true}).click();await page.getByRole('main',{name:'My month'}).waitFor();
  const report=page.getByRole('region',{name:'Quarterly IFTA / IRP miles'});await report.waitFor();await report.getByLabel('Report year',{exact:true}).selectOption('2026');await report.getByLabel('Quarter',{exact:true}).selectOption('4');await report.getByLabel('Truck',{exact:true}).selectOption('36');
  assert.match(await report.innerText(),/1250\.0 mi/);assert.equal(await report.locator('tbody tr').count(),2);
  const downloadEvent=page.waitForEvent('download');await report.getByRole('button',{name:'Export quarter miles CSV',exact:true}).click();const download=await downloadEvent;const downloadPath=await download.path();const exported=fs.readFileSync(downloadPath,'utf8');assert.match(exported,/"36","IL","1000.000"/);assert.match(exported,/"36","IN","250.000"/);
  await page.getByLabel('Month',{exact:true}).fill('2026-10');const monthlyCard=page.locator('.rr-month-card').filter({has:page.getByRole('heading',{name:'State miles',exact:true})});assert.match(await monthlyCard.innerText(),/0\.0 mi/);assert.match(await monthlyCard.innerText(),/not assigned to this month/);
  const stored=await page.evaluate(async()=>{
   const value=JSON.parse(localStorage.getItem('road-ready-owner-ops-v102'));
   const original=await new Promise((resolve,reject)=>{const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('document_blobs'),q=tx.objectStore('document_blobs').getAll();q.onsuccess=()=>{db.close();resolve(q.result);};};});
   return {rows:value.mileageImports,originals:await Promise.all(original.map(async row=>({text:await window.__rrFixtureBlob(row.blob).text(),sha256:row.sha256})))};
  });assert.equal(stored.rows.length,2);assert.equal(stored.originals.length,1);assert.equal(stored.originals[0].text,csv);assert.match(stored.originals[0].sha256,/^[a-f0-9]{64}$/);
  await page.evaluate(()=>{window.open=()=>({location:{set href(value){window.__openedMileageOriginal=value;}},close(){}});});await report.getByText('Original mileage reports (1)',{exact:true}).click();await report.getByRole('button',{name:'Open original',exact:true}).click();await page.waitForFunction(()=>window.__openedMileageOriginal?.startsWith('blob:'));assert.equal(await page.evaluate(async()=>await (await fetch(window.__openedMileageOriginal)).text()),csv,'Actual Open original handler returns exact persisted bytes');
  await report.getByLabel('Quarter',{exact:true}).selectOption('3');assert.match(await report.innerText(),/0\.0 mi/);await report.getByLabel('Quarter',{exact:true}).selectOption('4');
  for(const width of [320,390,820]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Fits '+width);}
  const after=await snapshot(page);for(const field of ['eventsByDay','signatureByDay','certifyStatus','formByDay'])assert.deepEqual(after[field],before[field],field+' stays exact');
  assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/${name}.png`,fullPage:true});console.log('PASS '+name+' — Motive quarter preview/save, original checksum, reimport, revised total blocked, quarter/truck breakdown, CSV export, no monthly allocation, exact signed logs and iPhone/iPad widths');
 }catch(error){console.error({name,errors,body:await page.locator('body').innerText()});await page.screenshot({path:`${out}/${name}-failed.png`,fullPage:true});throw error;}
 finally{await browser.close();}
}
