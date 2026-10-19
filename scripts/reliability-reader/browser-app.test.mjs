// Runs real Reader/filing/Load folders/packet components in ui-test-page.jsx.
// The route must be copied only into an isolated runtime and removed before
// deployment. This script opens a fresh profile and blocks all cloud traffic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
process.env.PLAYWRIGHT_BROWSERS_PATH||='/tmp/road-ready-test-browsers';
const require=createRequire(import.meta.url),engine=process.env.READER_TEST_BROWSER||process.argv[2]||'chromium';
if(engine==='webkit')process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS||='1'; // Test-only libraries are extracted under /tmp.
const {chromium,webkit}=require('playwright');
const origin=process.env.READER_UI_ORIGIN||'http://127.0.0.1:3017';
const fixtures=process.env.READER_UI_FIXTURES||'/workspace/scratch/e06b4e0f08ac/reader-synthetic-fixtures';
const outputs=process.env.READER_UI_OUTPUTS||'/workspace/scratch/e06b4e0f08ac/reader-ui-results';
const assets=process.env.READER_UI_ASSETS||'/tmp/road-ready-test-browsers';
const runtime=process.env.READER_UI_RUNTIME||'/tmp/road-ready-review-runtime';
const JSZip=createRequire(path.join(runtime,'package.json'))('jszip');
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
fs.mkdirSync(outputs,{recursive:true});
const cached=new Map([
 ['https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs','pdf.min.mjs'],
 ['https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs','pdf.worker.min.mjs'],
 ['https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js','tesseract.min.js'],
 ['https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js','tesseract-worker.min.js'],
 ['https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz','eng.traineddata.gz'],
 ...['relaxedsimd-lstm','simd-lstm','lstm'].map(kind=>[`https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core-${kind}.wasm.js`,`tesseract-core-${kind}.wasm.js`]),
]);
const browser=await ({chromium,webkit})[engine].launch({headless:true});
const errors=[],blocked=[],passes=[];let page;
try{
 const context=await browser.newContext({viewport:engine==='webkit'?{width:820,height:1180}:{width:430,height:932},serviceWorkers:'block',acceptDownloads:true});
 await context.route('**/*',async route=>{
  const url=route.request().url();
  if(url.includes('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":"Synthetic offline test"}'});
  if(cached.has(url)){const name=cached.get(url);return route.fulfill({status:200,contentType:name.endsWith('.gz')?'application/gzip':'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:fs.readFileSync(path.join(assets,name))});}
  if(url.startsWith(origin+'/')||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
  blocked.push(url);return route.abort();
 });
 page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 page.setDefaultTimeout(25000);
 const snapshot=()=>page.evaluate(()=>window.__readerUITest.read());
 const passed=name=>{passes.push(name);console.log('PASS '+engine+' — '+name);};
 const control=async label=>{const details=page.getByText('Test controls',{exact:true});if(!await details.evaluate(el=>el.parentElement.open))await details.click();await page.getByRole('button',{name:label,exact:true}).click();};
 async function importPdf(name,{initial=false}={}){
  if(initial)await page.getByLabel('Test original',{exact:true}).setInputFiles(path.join(fixtures,name));
  else {await page.locator('section[aria-label="Document scanner"] input[type=file][accept*="application/pdf"]').setInputFiles(path.join(fixtures,name));await page.getByRole('button',{name:'Read document',exact:true}).click();}
  await page.getByLabel('Document type',{exact:true}).waitFor({timeout:180000});
 }
 async function saveReviewed(){
  const risk=page.getByLabel('I reviewed these risks and have the required links/apps');if(await risk.count())await risk.check();
  const confirm=page.getByLabel('I checked the type, load and date');if(await confirm.count())await confirm.check();
  await page.getByRole('button',{name:/^Save (document|for review)$/}).click();
  await page.getByText(/^DOCUMENT (AND GUIDE )?SAVED$/).waitFor({timeout:30000});
 }
 await page.goto(origin+'/reader-ui-test',{waitUntil:'domcontentloaded',timeout:120000});
 await page.getByRole('button',{name:'Open Reader',exact:true}).click();
 await importPdf('synthetic-rate-native.pdf');
 assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'rate_confirmation');
 await page.getByRole('button',{name:/^Extracted details/}).click();
 assert.match(await page.locator('body').innerText(),/Read 2 of 2 pages/);
 await saveReviewed();
 const first=await snapshot(),rate=first.documents[0],nativeBytes=fs.readFileSync(path.join(fixtures,'synthetic-rate-native.pdf'));
 assert.equal(first.documents.length,1);assert.equal(first.blobs.filter(row=>row.size).length,1);assert.equal(rate.sha256,hash(nativeBytes));
 for(const [key,value]of Object.entries({loadNo:'TEST-80173',poNumber:'PO-64318',broker:'EXAMPLE FREIGHT LLC',carrierName:'EXAMPLE CARRIER LLC',gross:'2350.00',pickupDate:'2026-10-12',deliveryDate:'2026-10-14',documentDate:'2026-10-12',pickupAppointment:'08:00 - 16:00',deliveryAppointment:'09:00 - 17:00',origin:'123 Example Rd Albany, NY 12207'}))assert.equal(rate.extracted[key],value,key);
 assert.equal(rate.extracted.stops.length,2);assert.equal(rate.extracted.stops[0].time,'');assert.equal(rate.extracted.stops[1].address,'456 Sample St Madison, WI 53703');
 assert.deepEqual(first.state.eventsByDay,{});
 const originalDownload=page.waitForEvent('download');await page.getByRole('link',{name:'Download',exact:true}).click();const original=await originalDownload;
 assert.equal(hash(fs.readFileSync(await original.path())),hash(nativeBytes));
 passed('real intake → native 2-page PDF.js → review → durable save; all fields, stops and original bytes verified');
 await page.getByRole('button',{name:'Open Documents',exact:true}).click();
 await page.getByRole('button',{name:'Loads',exact:true}).click();
 await page.getByRole('button',{name:/Oct 12.*Oct 18/}).click();
 await page.getByRole('button',{name:/Load TEST-80173/}).click();
 assert.match(await page.locator('body').innerText(),/123 Example Rd Albany, NY/);
 await page.getByRole('button',{name:'Open Rate confirmation',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Original document',exact:true});await dialog.getByRole('link',{name:'Download',exact:true}).waitFor();
 const reopenedDownload=page.waitForEvent('download');await dialog.getByRole('link',{name:'Download',exact:true}).click();
 assert.equal(hash(fs.readFileSync(await (await reopenedDownload).path())),hash(nativeBytes));await dialog.getByRole('button',{name:'Close',exact:true}).click();
 const weeks=(await snapshot()).weeks,appearances=weeks.flatMap(week=>week.loads.filter(load=>load.loadNo==='CROSS-TEST-71').map(load=>({week:week.start,id:load.id})));
 assert.deepEqual(appearances.map(row=>row.week).sort(),['2026-10-05','2026-10-12']);assert.equal(new Set(appearances.map(row=>row.id)).size,1);
 await page.screenshot({path:path.join(outputs,engine+'-native-load.png'),fullPage:true});
 passed('saved original reopened from actual load folder; route addresses preserved; Friday→Tuesday load keeps one ID in both weeks');
 await control('Test Reader');await importPdf('synthetic-rate-native.pdf');await saveReviewed();
 const duplicate=await snapshot();assert.equal(duplicate.documents.length,1);assert.equal(duplicate.documents[0].local_id,rate.local_id);assert.equal(duplicate.store.loads.filter(load=>load.loadNo==='TEST-80173').length,1);
 passed('same original reimport through actual Reader does not duplicate the document or load');
 await control('Test fixed Add POD Reader');await importPdf('synthetic-rate-native.pdf',{initial:true});
 assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'pod');assert.equal(await page.getByLabel('Document type',{exact:true}).isDisabled(),true);
 assert.match(await page.locator('body').innerText(),/Load CROSS-TEST-71/);
 await saveReviewed();
 const fixed=await snapshot(),fixedPod=fixed.documents.find(doc=>doc.document_type==='pod');
 assert.equal(fixedPod.load_no,'CROSS-TEST-71');assert.equal(fixedPod.stopSequence,1);assert.equal(fixedPod.extracted.linkToLogbook,false);
 assert.equal(fixed.blobs.filter(row=>row.size).length,1);assert.equal(fixed.documents.length,2);assert.notEqual(fixedPod.local_id,rate.local_id);
 passed('Add POD Reader context stays fixed through differing RateCon classification; one original has two independent filings');
 await control('Test Add POD');assert.equal(await page.getByLabel('Document date',{exact:true}).inputValue(),'');
 assert.equal(await page.getByLabel('I checked the receiver signature on the original.').isChecked(),false);
 await page.locator('section[aria-label="Document scanner"] input[type=file][accept="application/pdf,.pdf"]').setInputFiles(path.join(fixtures,'synthetic-rate-scan.pdf'));
 await page.getByRole('button',{name:'Save POD',exact:true}).click();await page.getByRole('heading',{name:'POD saved',exact:true}).waitFor();
 const attached=await snapshot(),capture=attached.documents.find(doc=>doc.document_type==='pod'&&doc.sha256!==rate.sha256);
 assert.equal(capture.load_no,'CROSS-TEST-71');assert.equal(capture.extracted.podSigned,false);assert.equal(capture.extracted.signatureReviewV1.status,'needs_review');assert.equal(capture.document_date,null);
 passed('actual Add POD capture saves to selected load/stop; upload date is separate and signature stays pending without confirmation');
 await control('Test Documents');await page.getByRole('button',{name:'Packets',exact:true}).click();await page.getByRole('button',{name:'Prepare ZIP',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('link',{name:'Save ZIP',exact:true}).click();
 const zipPath=path.join(outputs,engine+'-actual-ui-packet.zip');await (await download).saveAs(zipPath);const zip=await JSZip.loadAsync(fs.readFileSync(zipPath));
 const manifest=JSON.parse(await zip.file('manifest.json').async('string'));assert.equal(manifest.records.length,3);assert.equal(new Set(manifest.records.map(row=>row.path)).size,2);
 const originals=await Promise.all([...new Set(manifest.records.map(row=>row.path))].map(async name=>hash(await zip.file(name).async('nodebuffer'))));assert.ok(originals.includes(hash(nativeBytes)));assert.ok(originals.includes(hash(fs.readFileSync(path.join(fixtures,'synthetic-rate-scan.pdf')))));
 passed('actual Packets UI export contains three filing records and exactly two complete original files with verified hashes');
 if(process.env.READER_UI_SKIP_OCR!=='1')for(const kind of ['scan','photo']){
  await control('Test Reader');await importPdf('synthetic-rate-'+kind+'.pdf');await saveReviewed();const current=await snapshot(),expectedHash=hash(fs.readFileSync(path.join(fixtures,'synthetic-rate-'+kind+'.pdf'))),doc=current.documents.find(row=>row.sha256===expectedHash&&row.document_type==='rate_confirmation');
  fs.writeFileSync(path.join(outputs,engine+'-'+kind+'-actual-reading.json'),JSON.stringify(doc,null,2));
  assert.ok(doc,'RateCon saved after actual '+kind+' OCR');assert.equal(doc.sha256,expectedHash);
  const expectedFields={loadNo:'TEST-80173',gross:'2350.00',pickupDate:'2026-10-12',deliveryDate:'2026-10-14',poNumber:'PO-64318',pickupAppointment:'08:00 - 16:00',deliveryAppointment:'09:00 - 17:00'};
  if(kind==='scan')for(const key of ['loadNo','gross','pickupDate','deliveryDate'])assert.equal(doc.extracted[key],expectedFields[key]);
  const proof=doc.extracted.readerSourceFieldsV110393?.fields||{};for(const [key,expected]of Object.entries(expectedFields))if(proof[key])assert.equal(proof[key].value,expected);
  if(!doc.extracted.loadNo){assert.equal(doc.load_no,null);assert.equal(doc.document_date,null);assert.match(await page.locator('body').innerText(),/Needs Review/);assert.equal(current.store.loads.filter(load=>load.loadNo==='TEST-80173').length,1);}
  passed('actual browser OCR of 2-page '+kind+' PDF preserves full original; supported fields match source and uncertain identity/date stay unassigned for review');
 }
 assert.deepEqual(errors,[]);const result={engine,passes,blockedExternalRequests:blocked,documentCount:(await snapshot()).documents.length};fs.writeFileSync(path.join(outputs,engine+'-actual-ui-report.json'),JSON.stringify(result,null,2));
}catch(error){if(page){console.error((await page.locator('body').innerText()).slice(-14000));await page.screenshot({path:path.join(outputs,engine+'-actual-ui-failure.png'),fullPage:true}).catch(()=>{});}throw error;}
finally{await browser.close();}
