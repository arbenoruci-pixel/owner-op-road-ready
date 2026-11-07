import {selectedLoadFolder,chooseLoadFolder} from '../test-support/load-folder-browser.mjs';
// Current compact scanner contract: one bounded automatic proposal, never automatic acceptance.
// Legacy manual-component contract remains in scripts/reader-ai/browser-extraction.mjs.
// Local synthetic integration only. OCR, AI and every backend request are mocked.
// Run against a materialized app with TEST_ORIGIN and PLAYWRIGHT_BROWSERS_PATH.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {origin,baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
import {AI_READER_VERSION} from '../../lib/reader-ai/policy.js';
import {AI_EXTRACTION_VERSION} from '../../lib/reader-ai/extraction.js';
import {AI_READER_LIMITS} from '../../lib/reader-ai/diagnostics.js';

assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname),'Synthetic tests require loopback');
const output='browser-test-results/ai-extraction';
fs.mkdirSync(output,{recursive:true});
const lines=['BILL OF LADING','BOL No: B-4321','SHIP FROM: EXAMPLE MILL',
  'SHIP TO: EXAMPLE MARKET','Carrier: EXAMPLE FREIGHT','Order reference: PO-7401','Weight: 1000 LB'];
const value='PO-7401',quote='Order reference: PO-7401',loadNo='KEEP-9001';
const scenarios=(process.env.AI_EXTRACTION_CASES||'confirm,malformed,wrong_image,wrong_page,missing_quote,offline,timeout,cancel').split(',');

let latestReviewExport=null;
async function exportReview(page){
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export reading review',exact:true}).click()]);
  latestReviewExport=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  return latestReviewExport;
}
async function savedRows(page){
  return page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const db=request.result,tx=db.transaction('documents_local','readonly'),rows=tx.objectStore('documents_local').getAll();
      tx.oncomplete=()=>{resolve(rows.result);db.close();};tx.onerror=()=>reject(tx.error);};
  }));
}

for(const scenario of scenarios){
  latestReviewExport=null;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ai-extraction-'));
  const context=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],requests=[],external=[];
  page.setDefaultTimeout(45000);page.on('pageerror',error=>errors.push(error.message));
  let gets=0,releaseRequest,releaseResponse;
  const responseGate=new Promise(resolve=>{releaseResponse=resolve;});
  try{
    await setupRoutes(context);
    // The shared fixture allows PDF.js's CDN. These image-only tests allow no CDN.
    await context.route('https://cdn.jsdelivr.net/**',route=>route.abort('blockedbyclient'));
    context.on('request',request=>{if(!request.url().startsWith(origin)&&/^https?:/.test(request.url()))external.push(request.url());});
    await context.route('**/api/reader/classify',async route=>{
      if(route.request().method()==='GET'){
        gets++;
        return route.fulfill({json:{enabled:true,version:AI_READER_VERSION,model:'example/vision',extraction:{version:AI_EXTRACTION_VERSION}}});
      }
      const input=route.request().postDataJSON();requests.push(input);
      assert.equal(input.operation,'extract','classification must not run for the supported local BOL');
      assert.equal(input.kind,'bol');assert.equal(input.pageNumber,1);
      assert.deepEqual(Object.keys(input).sort(),['fields','image','kind','operation','pageNumber','text']);
      assert.ok(input.fields.includes('poNumber'));assert.ok(!input.fields.includes('bolNumber'));
      assert.match(input.image,/^data:image\/jpeg;base64,/);assert.match(route.request().headers().authorization,/^Bearer /);
      assert.ok(input.text.includes(quote));
      if(scenario==='timeout'||scenario==='cancel')return new Promise(resolve=>{releaseRequest=async()=>{await route.abort('timedout').catch(()=>{});resolve();};});
      const imageHash=createHash('sha256').update(Buffer.from(input.image.split(',')[1],'base64')).digest('hex');
      const candidate={field:'poNumber',rawValue:value,quote,location:'middle'};
      if(scenario==='malformed')candidate.rawValue='NOT-IN-SOURCE-QUOTE';
      if(scenario==='missing_quote')candidate.quote='Missing order reference: '+value;
      // Hold proposals until baseline source/field snapshots have been exported.
      await responseGate;
      return route.fulfill({json:{ok:true,pageNumber:scenario==='wrong_page'?2:1,result:{kind:'bol',quality:'readable',
        candidates:[candidate],version:AI_EXTRACTION_VERSION,model:'example/vision',
        imageHash:scenario==='wrong_image'?'0'.repeat(64):imageHash,checkedAt:'2026-10-14T00:00:00Z'}}});
    });
    await context.addInitScript(({lines,serverTimeoutMs})=>{
      // Only the known extraction deadline is shortened. Other timers and OCR are real.
      const nativeSetTimeout=window.setTimeout.bind(window);
      window.setTimeout=(fn,ms,...args)=>nativeSetTimeout(fn,ms===serverTimeoutMs?10000:ms,...args);
      window.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async file=>{
        const bitmap=await createImageBitmap(file),width=bitmap.width,height=bitmap.height;bitmap.close();
        const tsv=['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
          [1,1,0,0,0,0,0,0,width,height,-1,''].join('\t'),
          ...lines.map((line,i)=>[5,1,i+1,1,1,1,Math.round(width*.06),Math.round(height*(.07+i*.11)),Math.round(width*.85),Math.round(height*.03),96,line].join('\t'))];
        return {data:{text:lines.join('\n'),confidence:96,tsv:tsv.join('\n')}};
      }})};
    },{lines,serverTimeoutMs:scenario==='timeout'?AI_READER_LIMITS.serverTimeoutMs:-1});
    const state=baseState();state.view='logbook';state.testInstructionStore={loads:[{id:'fixture-load',loadNo,
      broker:'Example Broker',origin:'Example City, IL',destination:'Example Town, IN',pickupDate:'2026-09-07',
      operationalStatus:'closed',documentLibrarySource:'synthetic-browser-fixture'}],documents:[]};
    await seed(page,state);
    const bytes=await page.evaluate(lines=>{
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1600;
      const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,1200,1600);c.fillStyle='black';c.font='32px sans-serif';
      lines.forEach((line,i)=>c.fillText(line,72,1600*(.1+i*.11)));
      return canvas.toDataURL('image/png').split(',')[1];
    },lines);
    if(scenario==='offline')await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true}));
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'synthetic-extraction.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByRole('button',{name:'All reading details',exact:true}).click();
    const suggestions=page.getByRole('region',{name:'Key details for Bill of lading',exact:true});
    await suggestions.waitFor();
    const initialType=await page.getByLabel('Document type',{exact:true}).inputValue();
    assert.equal(initialType,'bol','local supported BOL determines filing type before AI proposals');
    const initialFolder=await selectedLoadFolder(page);
    const before=await exportReview(page),doc=before.documents[0];
    assert.equal(doc.kind,'bol');assert.equal(doc.fields.poNumber.status,'missing');assert.equal(doc.fields.poNumber.value,null);
    assert.equal((await savedRows(page)).length,0,'reading does not save a document');
    if(scenario!=='offline'){
      for(let tries=0;requests.length===0&&tries<200;tries++)await page.waitForTimeout(20);
      assert.equal(requests.length,1,'one bounded automatic request starts for the missing fields');
    }
    releaseResponse();
    if(scenario==='cancel'){
      assert.ok(releaseRequest,'request is pending before cancellation');
      await suggestions.getByRole('button',{name:'Stop reading',exact:true}).click();
      await suggestions.getByText('Reading stopped.',{exact:true}).waitFor();
    }else if(['confirm','missing_quote'].includes(scenario)){
      await suggestions.getByRole('button',{name:'Check 1 read detail',exact:true}).waitFor();
    }else{
      await suggestions.getByRole('button',{name:'Read page again',exact:true}).waitFor();
    }
    // Details are navigation, not consent to send another request.
    await page.getByRole('button',{name:'All reading details',exact:true}).click();
    await page.getByRole('button',{name:'All reading details',exact:true}).click();
    const proposed=await exportReview(page);
    assert.deepEqual(proposed.documents,before.documents,'AI responses must not alter core documents');
    assert.deepEqual(proposed.pages,before.pages,'AI responses must not inject OCR or change source observations');
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),initialType,'AI must not assign filing type');
    assert.equal(await selectedLoadFolder(page),initialFolder,'AI must not assign a folder');
    assert.equal((await savedRows(page)).length,0,'AI candidates must not persist a document');
    assert.equal(requests.length,scenario==='offline'?0:1,'automatic reading and details toggles send at most one page request');
    if(['confirm','missing_quote'].includes(scenario)){
      assert.equal(proposed.aiExtraction.state,'attempted');assert.equal(proposed.aiExtraction.candidates.length,1);
      const candidate=proposed.aiExtraction.candidates[0];
      assert.equal(candidate.verified,false);assert.equal(candidate.canAutoFile,false);assert.equal(candidate.requiresReview,true);
      if(scenario==='missing_quote'){
        assert.equal(candidate.visualOnly,true);assert.deepEqual(candidate.provenance.evidence,[]);
        assert.equal(candidate.provenance.sourceLinkVerified,false);assert.equal(proposed.aiExtraction.reason,'visual_candidates');
      }else assert.equal(candidate.provenance.evidence[0].sourceLinkVerified,true);
      assert.equal(candidate.provenance.providerImage.imageHash,createHash('sha256').update(Buffer.from(requests[0].image.split(',')[1],'base64')).digest('hex'),'candidate is bound to the exact submitted original-page image');
      assert.equal(candidate.provenance.providerImage.pageNumber,1);assert.match(candidate.provenance.providerImage.sourceImageId,/:original$/);
      await suggestions.getByRole('button',{name:'Check 1 read detail',exact:true}).click();
      assert.equal(await suggestions.getByLabel('Check PO number',{exact:true}).inputValue(),value);
      const img=suggestions.getByRole('img',{name:'Original document page for checking the reading',exact:true});
      await img.waitFor();
      const originalBytes=await img.evaluate(async img=>Array.from(new Uint8Array(await(await fetch(img.src)).arrayBuffer())));
      // Photo intake retains the immutable upload and a perspective-corrected
      // review page separately. Verify the provider saw this exact review source.
      const preparedImage=await img.evaluate(async(img,maxDimension)=>{
        const file=await(await fetch(img.src)).blob(),source=await createImageBitmap(file,{imageOrientation:'from-image'});
        const scale=Math.min(1,Math.max(900,maxDimension)/Math.max(source.width,source.height));
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));
        const x=canvas.getContext('2d',{alpha:false,willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.fillStyle='#fff';x.fillRect(0,0,canvas.width,canvas.height);x.drawImage(source,0,0,canvas.width,canvas.height);source.close();
        const encoded=document.createElement('canvas');encoded.width=canvas.width;encoded.height=canvas.height;encoded.getContext('2d',{alpha:false}).putImageData(x.getImageData(0,0,canvas.width,canvas.height),0,0);
        const blob=await new Promise(resolve=>encoded.toBlob(resolve,'image/jpeg',.85));return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});
      },AI_READER_LIMITS.maxImageDimension);
      assert.equal(preparedImage,requests[0].image,'provider input is encoded from the exact displayed retained review page');
      await suggestions.screenshot({path:`${output}/chromium-${scenario}-source-confirmation.png`});
      await suggestions.getByRole('button',{name:'Close',exact:true}).click();
      assert.equal((await exportReview(page)).documents[0].fields.poNumber.value,null,'opening and closing review is not confirmation');
      await suggestions.getByRole('button',{name:'Check 1 read detail',exact:true}).click();
      await suggestions.getByRole('button',{name:'Use checked details',exact:true}).click();
      const confirmed=await exportReview(page);
      assert.equal(confirmed.documents[0].fields.poNumber.value,value);assert.equal(confirmed.documents[0].fields.poNumber.status,'confirmed');
      assert.equal(confirmed.aiExtraction.candidates[0].verified,false,'human confirmation must not rewrite AI provenance as verified');
      assert.equal(confirmed.documents[0].fields.poNumber.correction.origin,'human');
      assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),initialType);
      assert.equal(await selectedLoadFolder(page),initialFolder);
      assert.equal((await savedRows(page)).length,0,'human reading confirmation does not itself save');
      // Re-selecting the identical option dispatches a synthetic change event
      // and intentionally reanalyzes the document. Keep the supported type.
      assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'bol');
      await chooseLoadFolder(page,loadNo);
      assert.equal(await selectedLoadFolder(page),loadNo);
      const check=page.locator('.scan-driver-check-v105 input');if(await check.count())await check.check();
      await page.getByRole('button',{name:/^Save document$|^Save for review$/}).click();
      await page.locator('.scan-saved-v105').waitFor();await page.reload();
      const saved=(await savedRows(page)).find(row=>row.extracted?.readerReviewV110345);
      assert.ok(saved,'saved review survives page reload');
      assert.equal(saved.type,'bol');assert.equal(saved.load_no,loadNo);
      const snapshot=saved.extracted.readerAnalysisV1;
      assert.equal(snapshot.version,1);assert.equal(snapshot.selection.type,'bol');assert.equal(snapshot.selection.loadNo,loadNo);
      assert.equal(snapshot.groups[0].fields.poNumber.value,value);assert.equal(snapshot.groups[0].fields.poNumber.status,'confirmed');
      assert.equal(saved.extracted.readerReviewV110345.aiExtraction.candidates[0].rawValue,value);
      const serialized=JSON.stringify(snapshot);
      assert.ok(serialized.includes(AI_EXTRACTION_VERSION),'saved snapshot retains extraction version diagnostics');
      assert.ok(serialized.includes(scenario==='missing_quote'?'visual_candidates':'source_linked_candidates'),'saved snapshot retains extraction outcome');
      assert.equal(requests.length,1,'human confirmation and filing never repeat inference');
      const assets=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('capture_asset_blobs'),q=tx.objectStore('capture_asset_blobs').getAll();tx.oncomplete=async()=>{try{resolve(await Promise.all(q.result.map(async row=>{const b=row.blob||row.file;if(!b)return null;const blob=window.__rrFixtureBlob?window.__rrFixtureBlob(b):b;return {...row,blob:undefined,file:undefined,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};})));}catch(e){reject(e);}finally{db.close();}};};}));
      const ownedAssets=assets.filter(row=>row?.client_document_id===saved.client_document_id&&row.current);
      assert.ok(ownedAssets.some(row=>row.variants?.some(v=>v.kind==='original')&&Buffer.from(row.bytes).equals(Buffer.from(bytes,'base64'))),'immutable uploaded PNG bytes persist in original capture asset after reload');
      assert.ok(ownedAssets.some(row=>row.variants?.some(v=>v.kind==='perspective-corrected')&&Buffer.from(row.bytes).equals(Buffer.from(originalBytes))),'human review bytes exactly match retained perspective-corrected source after reload');
      fs.writeFileSync(`${output}/chromium-saved-analysis.json`,JSON.stringify(snapshot,null,2));
    }else if(scenario==='cancel'){
      assert.equal((proposed.aiExtraction?.candidates||[]).length,0);
    }else{
      assert.equal((proposed.aiExtraction?.candidates||[]).length,0);
      assert.equal(await suggestions.getByRole('button',{name:/^Check \d+ read details?$/}).count(),0,'invalid or unavailable responses expose no confirmable proposals');
      assert.equal(proposed.aiExtraction.reason,{offline:'offline',timeout:'timed_out',malformed:'invalid_ai_result',wrong_image:'invalid_ai_result',wrong_page:'invalid_ai_result'}[scenario]);
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS chromium ${scenario}: bounded automatic one-page proposal, source binding, unchanged type/load and no automatic writes${['confirm','missing_quote'].includes(scenario)?', manual confirmation and saved/reopened diagnostics':''}; ${requests.length} mocked inference, ${gets} availability checks, ${external.length} blocked/stubbed external requests`);
  }catch(error){
    await page.screenshot({path:`${output}/chromium-${scenario}-failure.png`,fullPage:true}).catch(()=>{});
    fs.writeFileSync(`${output}/chromium-${scenario}-failure.json`,JSON.stringify({error:String(error),errors,latestReviewExport,savedRows:await savedRows(page).catch(()=>[]),requests:requests.map(({image,...request})=>request),body:await page.locator('body').innerText().catch(()=>''),url:page.url()},null,2));
    throw error;
  }finally{releaseResponse();await releaseRequest?.();await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
