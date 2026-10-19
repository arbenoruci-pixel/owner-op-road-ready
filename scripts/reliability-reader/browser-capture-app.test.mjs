// Actual JPG/PNG intake, processing, review, save, reopen and packet export.
// Synthetic files only, a fresh browser profile and no cloud requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
process.env.PLAYWRIGHT_BROWSERS_PATH||='/tmp/road-ready-test-browsers';
const require=createRequire(import.meta.url),engine=process.env.READER_TEST_BROWSER||process.argv[2]||'chromium';
if(!['chromium','webkit'].includes(engine))throw Error('Choose chromium or webkit.');
if(engine==='webkit')process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS||='1';
const browserType=require('playwright')[engine];
const origin=process.env.READER_UI_ORIGIN||'http://127.0.0.1:3017';
const fixtures=process.env.READER_UI_FIXTURES||'/workspace/scratch/e06b4e0f08ac/reader-synthetic-fixtures';
const outputs=process.env.READER_UI_OUTPUTS||'/workspace/scratch/e06b4e0f08ac/reader-ui-results';
const assets=process.env.READER_UI_ASSETS||'/tmp/road-ready-test-browsers';
const runtime=process.env.READER_UI_RUNTIME||'/tmp/road-ready-review-runtime';
const JSZip=createRequire(path.join(runtime,'package.json'))('jszip');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(outputs,{recursive:true});
const cached=new Map([
 ['https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs','pdf.min.mjs'],
 ['https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs','pdf.worker.min.mjs'],
 ['https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js','tesseract.min.js'],
 ['https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js','tesseract-worker.min.js'],
 ['https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz','eng.traineddata.gz'],
 ...['relaxedsimd-lstm','simd-lstm','lstm'].map(kind=>[`https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core-${kind}.wasm.js`,`tesseract-core-${kind}.wasm.js`]),
]);
const browser=await browserType.launch({headless:true}),errors=[],blocked=[],passes=[];let page;
try{
 const context=await browser.newContext({viewport:engine==='webkit'?{width:820,height:1180}:{width:430,height:932},serviceWorkers:'block',acceptDownloads:true});
 await context.route('**/*',async route=>{
  const url=route.request().url();
  if(url.includes('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":"Synthetic offline test"}'});
  if(cached.has(url)){const name=cached.get(url);return route.fulfill({status:200,contentType:name.endsWith('.gz')?'application/gzip':'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:fs.readFileSync(path.join(assets,name))});}
  if(url.startsWith(origin+'/')||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
  blocked.push(url);return route.abort();
 });
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
 const snapshot=()=>page.evaluate(()=>window.__readerUITest.read());
 const passed=name=>{passes.push(name);console.log('PASS '+engine+' — '+name);};
 const control=async label=>{const details=page.getByText('Test controls',{exact:true});if(!await details.evaluate(el=>el.parentElement.open))await details.click();await page.getByRole('button',{name:label,exact:true}).click();};
 const uniqueBytes=data=>assert.equal(new Set(data.physicalHashes).size,data.physicalHashes.length,'identical content must have one physical owner across document and capture tables');
 async function saveReviewed(){
  const risk=page.getByLabel('I reviewed these risks and have the required links/apps');if(await risk.count())await risk.check();
  const confirm=page.getByLabel('I checked the type, load and date');if(await confirm.count())await confirm.check();
  await page.getByRole('button',{name:/^Save (document|for review)$/}).click();
  await page.getByText(/^DOCUMENT (AND GUIDE )?SAVED$/).waitFor({timeout:30000});
 }
 async function importPhoto(fileName){
  await control('Test fixed Add POD Reader');
  // This is the real Choose a file input. Test original would bypass image
  // processing and would miss the byte-duplication defect this test targets.
  await page.locator('section[aria-label="Document scanner"] input[type=file][accept*="application/pdf"]').setInputFiles(path.join(fixtures,fileName));
  await page.getByRole('button',{name:'Read document',exact:true}).click({timeout:120000});
  await page.getByLabel('Document type',{exact:true}).waitFor({timeout:240000});
  assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'pod');
  assert.equal(await page.getByLabel('Document type',{exact:true}).isDisabled(),true);
  await saveReviewed();
  const result=await snapshot();uniqueBytes(result);assert.deepEqual(result.state.eventsByDay,{});
  assert.ok(result.documents.every(row=>row.load_no==='CROSS-TEST-71'&&row.stopSequence===1));
  return result;
 }
 await page.goto(origin+'/reader-ui-test',{waitUntil:'domcontentloaded',timeout:120000});
 await page.getByRole('button',{name:'Open Reader',exact:true}).waitFor();
 const images=['photo-1.jpg','scan-1.png'],rawHashes=images.map(name=>sha(fs.readFileSync(path.join(fixtures,name))));
 for(let index=0;index<images.length;index++){
  const name=images[index],first=await importPhoto(name),captures=first.captures.filter(row=>row.variants.some(variant=>variant.kind==='original')&&row.resolvedSha256===rawHashes[index]);
  assert.ok(captures.length,'exact raw input is preserved separately from finished output');
  const client=captures.at(-1).client_document_id,doc=first.documents.find(row=>row.client_document_id===client),beforeRuns=doc.capture_runs.length;
  const originals=first.captures.filter(row=>row.client_document_id===client);
  assert.ok(originals.some(row=>row.resolvedSha256===doc.sha256&&row.capture_original_ref_v1?.table==='document_blobs'),'finished image shares the main byte owner');
  const second=await importPhoto(name),secondDoc=second.documents.find(row=>row.local_id===doc.local_id);
  assert.equal(second.documents.length,first.documents.length,'unchanged photo does not duplicate its filing');
  assert.equal(secondDoc.capture_runs.length,beforeRuns+1,'each intake run remains in history');
  assert.equal(second.captures.length,first.captures.length+originals.filter(row=>row.current!==false).length,'each new run keeps its variant records');
  assert.deepEqual([...second.physicalHashes].sort(),[...first.physicalHashes].sort(),'unchanged photo adds no physical byte copy');
  assert.ok(first.captures.every(old=>second.captures.some(row=>row.local_asset_id===old.local_asset_id&&row.resolvedSha256===old.resolvedSha256)),'previous pages and versions kept');
  passed('actual '+name+' intake → image processing/OCR → fixed POD review/save; repeated input retains runs with one owner for identical bytes');
 }
 const beforeReload=await snapshot();await page.reload({waitUntil:'domcontentloaded',timeout:120000});await page.getByRole('button',{name:'Open Reader',exact:true}).waitFor();
 const reopened=await snapshot();uniqueBytes(reopened);
 assert.deepEqual(reopened.captures.map(row=>[row.local_asset_id,row.resolvedSha256]).sort(),beforeReload.captures.map(row=>[row.local_asset_id,row.resolvedSha256]).sort());
 for(const hash of rawHashes)assert.ok(reopened.captures.some(row=>row.resolvedSha256===hash&&row.variants.some(variant=>variant.kind==='original')));
 passed('fresh page reopen resolves every immutable raw photo, processed version and historical capture run');
 // The separate Add POD flow uses the same capture writer, without OCR.
 await control('Test Add POD');
 await page.locator('section[aria-label="Document scanner"] input[type=file][accept*="image"]').first().setInputFiles(path.join(fixtures,images[0]));
 await page.getByRole('button',{name:'Save POD',exact:true}).click({timeout:120000});await page.getByRole('heading',{name:'POD saved',exact:true}).waitFor();
 const modern=await snapshot();uniqueBytes(modern);
 assert.ok(modern.documents.every(row=>row.load_no==='CROSS-TEST-71'&&row.stopSequence===1));
 assert.ok(modern.captures.length>reopened.captures.length);assert.deepEqual([...modern.physicalHashes].sort(),[...reopened.physicalHashes].sort());
 passed('actual Add POD photo flow keeps load/stop context and reuses existing photo bytes');
 await control('Test Documents');await page.getByRole('button',{name:'Packets',exact:true}).click();await page.getByRole('button',{name:'Prepare ZIP',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('link',{name:'Save ZIP',exact:true}).click();
 const zipPath=path.join(outputs,engine+'-capture-ui-packet.zip');await (await download).saveAs(zipPath);
 const zip=await JSZip.loadAsync(fs.readFileSync(zipPath)),manifest=JSON.parse(await zip.file('manifest.json').async('string'));
 const versions=JSON.parse(await zip.file('Capture-versions.json').async('string')).assets;
 assert.equal(versions.length,modern.captures.length,'packet preserves every page/variant/run record');
 assert.ok(versions.every(row=>!row.capture_original_ref_v1&&!row.blob&&row.client_document_id),'packet includes selected metadata and self-contained binary paths');
 const paths=[...new Set([...manifest.records.map(row=>row.path),...versions.map(row=>row.path)])].filter(Boolean),hashes=await Promise.all(paths.map(async name=>sha(await zip.file(name).async('nodebuffer'))));
 assert.equal(new Set(hashes).size,hashes.length,'one ZIP entry for each content hash across originals and capture variants');
 assert.deepEqual([...hashes].sort(),[...modern.physicalHashes].sort());
 for(const row of versions)assert.equal(sha(await zip.file(row.path).async('nodebuffer')),row.sha256);
 passed('actual Packets ZIP contains every exact source/processed version once, with complete run/variant links after repeat and reopen');
 assert.deepEqual(errors,[]);
 const report={engine,passes,documents:modern.documents.length,captureRecords:modern.captures.length,captureRuns:modern.documents.reduce((n,row)=>n+row.capture_runs.length,0),uniqueFiles:modern.physicalHashes.length,rawInputs:images.map((name,i)=>({name,sha256:rawHashes[i]})),blockedExternalRequests:blocked};
 fs.writeFileSync(path.join(outputs,engine+'-capture-ui-report.json'),JSON.stringify(report,null,2));
 await page.screenshot({path:path.join(outputs,engine+'-capture-ui-packet.png'),fullPage:true});
}catch(error){if(page){console.error((await page.locator('body').innerText()).slice(-15000));await page.screenshot({path:path.join(outputs,engine+'-capture-ui-failure.png'),fullPage:true}).catch(()=>{});}throw error;}
finally{await browser.close();}
