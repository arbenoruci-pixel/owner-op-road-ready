// Real barcode pixels plus controlled OCR errors. Synthetic local data only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
const output='browser-test-results/bol-rows-v110384';fs.mkdirSync(output,{recursive:true});
async function savedRecords(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>{const db=r.result,q=db.transaction('documents_local').objectStore('documents_local').getAll();q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);}));}
const rows=[
 {text:'BILL OF LADING',x:60,y:35,w:450},
 {text:'B/L NO: 0012345000',x:640,y:175,w:390,confidence:76,words:[['B/L',640,52],['NO:',710,45],['0012345000',785,170]]},
 {text:'DATE: 08/19/2026 07:41:',x:640,y:225,w:500},
 {text:'CARRIER: X AND Y TRANSPORT',x:70,y:340,w:570},
 {text:'FROM: EXAMPLE FOODS',x:70,y:405,w:570},
 {text:'CONSIGNEE: REGIONAL MARKET',x:70,y:465,w:620},
 {text:'PO#: 123456',x:70,y:525,w:300},
 {text:'1111.50 PER',x:942,y:1408,w:144,h:57},
 {text:'TOTAL NET WEIGHT:',x:642,y:1422,w:195},
 {text:'3,373.90',x:942,y:1421,w:100},
 {text:'TOTAL WEIGHT:',x:642,y:1446,w:151},
 {text:'3,936.84f',x:942,y:1447,w:85},
 {text:'TOTAL UNITS:',x:42,y:1427,w:133},
 {text:'331',x:289,y:1425,w:29},
 {text:'TOTAL TARE: 562.94',x:42,y:1450,w:350},
 {text:'Frozen Loads: Use temp setting of -10F',x:70,y:1510,w:890}
];
for(const [name,browser]of [['chromium',chromium],['webkit',webkit]]){
  const instance=await browser.launch({headless:true}),context=await instance.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
  try{
    await setupRoutes(context);
    const manifest=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
    await context.addInitScript(manifest=>{
      const fetch=window.fetch.bind(window);
      window.fetch=(input,options)=>{
        const url=new URL(input instanceof Request?input.url:String(input),location.href);
        if(url.origin===location.origin&&url.pathname==='/app-version.json')return Promise.resolve(new Response(JSON.stringify(manifest),{status:200,headers:{'Content-Type':'application/json'}}));
        return fetch(input,options);
      };
    },manifest);
    await context.addInitScript(rows=>{
      window.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async(file)=>{
        const bitmap=await createImageBitmap(file),w=bitmap.width,h=bitmap.height;bitmap.close();
        const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
        const tsv=[header,[1,1,0,0,0,0,0,0,w,h,-1,''].join('\t')];
        const detail=file.name==='road-ready-identifier-detail.png',measurement=file.name==='road-ready-measurement-detail.png';
        if(detail||measurement){if(file.type!=='image/png')throw new Error('Detail image must be lossless PNG');window.readerDetails??=[];window.readerDetails.push({name:file.name,w,h});}
        // The phone returns two crop-relative lines, numeric text first, with
        // a tall low-confidence number box. An inline stub misses that failure.
        const observed=detail?[{text:"'BILNO.: 0012345000",x:10,y:200,w:1250,confidence:42}]:measurement?[
          {text:'3,936.84]',x:.766*1314,y:.126*1700,w:.192*1314,h:.747*1700,confidence:36.15},
          {text:'TOTAL WEIGHT:',x:.043*1314,y:.274*1700,w:.363*1314,h:.379*1700,confidence:96.53}
        ]:rows.map(row=>row.text.startsWith('DATE:')&&file.name!=='road-ready-clean-ocr.png'?{...row,text:'DATE: 08/19/2026 07:41:00'}:row);
        const x=v=>Math.round(v*w/1314),y=v=>Math.round(v*h/1700);
        for(const [i,row]of observed.entries())for(const [j,word]of (row.words||[[row.text,row.x,row.w]]).entries())tsv.push([5,1,i+1,1,1,j+1,x(word[1]),y(row.y),x(word[2]),Math.max(1,y(row.h||17)),row.confidence??96,word[0]].join('\t'));
        return {data:{text:observed.map(r=>r.text).join('\n'),confidence:96,tsv:tsv.join('\n')}};
      }})};
    },rows);
    const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};await seed(page,state);
    const png=await page.evaluate(rows=>{
      const canvas=document.createElement('canvas');canvas.width=1314;canvas.height=1700;
      const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='black';c.font='24px sans-serif';
      for(const row of rows)c.fillText(row.text.replace(/(?:BOL|BA) NO: 001234500/,'BOL NO: 0012345000').replace('bill of Iading','bill of lading'),row.x,row.y+24);
      let left=620;
      for(const symbol of ['211232','212222','112232','131123','231131','212222','221132','2331112'])for(const [i,run]of [...symbol].entries()){
        const width=Number(run)*4;if(i%2===0)c.fillRect(left,65,width,82);left+=width;
      }
      return canvas.toDataURL('image/png').split(',')[1];
    },rows);
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'synthetic-bol.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    const toggle=page.getByRole('button',{name:'Reader preview · Check source',exact:true});await toggle.waitFor();await toggle.click();
    const review=page.locator('.owned-reader-preview'),barcode=review.locator('.reader-barcode-check');
    await barcode.getByText('Barcode: 0012345000',{exact:true}).waitFor();assert.match(await barcode.innerText(),/matches a printed-number candidate/);
    await barcode.getByText('View barcode source',{exact:true}).click();await barcode.getByRole('img').waitFor();await barcode.getByRole('img').evaluate(img=>img.decode());
    assert.ok(await barcode.getByRole('img').evaluate(img=>img.naturalWidth>200));await barcode.screenshot({path:output+'/'+name+'-barcode-proof.png'});
    await barcode.getByRole('button',{name:'Check BOL number',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Check source',exact:true});await dialog.waitFor();
    await dialog.getByLabel('Source line highlight',{exact:true}).waitFor();
    await dialog.getByRole('button',{name:'Close source',exact:true}).click();
    await review.getByRole('button',{name:'Check Total weight source',exact:true}).click();
    assert.equal(await dialog.getByLabel('Confirmed value',{exact:true}).inputValue(),'3936.84');
    await dialog.getByLabel('Source line highlight',{exact:true}).waitFor();
    await dialog.screenshot({path:output+'/'+name+'-measurement-detail.png'});
    await dialog.getByRole('button',{name:'Confirm value',exact:true}).click();
    await dialog.getByRole('alert').filter({hasText:/ambiguous or invalid/}).waitFor();await dialog.getByRole('button',{name:'Close source',exact:true}).click();
    const download=page.waitForEvent('download');await review.getByRole('button',{name:'Export reading review',exact:true}).click();
    const exported=await download,result=JSON.parse(fs.readFileSync(await exported.path(),'utf8')),group=result.documents.find(g=>g.kind==='bol');
    assert.equal(group.fields.bolNumber.value,'0012345000');assert.equal(group.fields.bolNumber.status,'supported');assert.equal(group.fields.bolNumber.corroboration.method,'barcode_code128');
    assert.equal(group.fields.weight.status,'needs_review');assert.equal(group.fields.temperature.value,'-10 F');
    assert.equal(group.checks.find(c=>c.id==='bol_weight_arithmetic').status,'passed');assert.equal(group.checks.find(c=>c.id==='bol_barcode_comparison').status,'passed');
    assert.equal(group.canAutoFile,false);assert.deepEqual(errors,[]);
    assert.equal(result.engineVersion,'0.3.24');
    assert.equal(group.fields.documentDate.value,'2026-08-19');assert.equal(group.fields.totalUnits.value,'331');
    const total=group.fields.weight.candidates.find(c=>c.numericValue==='3936.84');assert.ok(total);
    assert.equal(total.evidence[0].supportMethod,'isolated_measurement_detail');
    assert.ok(Math.abs(total.evidence[0].recognizerConfidence-.3615)<.000001);
    assert.equal(total.evidence[0].quote,'3,936.84');assert.equal(total.labelEvidence[0].quote,'TOTAL WEIGHT:');
    assert.ok(total.evidence[0].sourceImageId.endsWith(':1-measurement-detail-1'));
    assert.deepEqual(group.fields.weight.issues,['weight_unit_required']);
    assert.equal(group.fields.weight.numberSupport.method,'matching_measurement_digits');
    assert.ok(!group.fields.weight.candidates.some(c=>c.numericValue==='1111.50'));
    assert.ok(!group.fields.netWeight.candidates.some(c=>c.numericValue==='1111.50'));
    assert.equal(result.pages[0].observations.filter(o=>o.id.includes('measurement-detail')).length,1);
    const details=await page.evaluate(()=>window.readerDetails||[]);assert.ok(details.some(d=>d.name==='road-ready-measurement-detail.png'&&d.h>40));
    await review.screenshot({path:output+'/'+name+'-rows.png'});
    await review.getByRole('button',{name:'Fix next reading',exact:true}).click();
    await dialog.getByRole('heading',{name:'Shipment weights',exact:true}).waitFor();
    assert.equal(await dialog.getByRole('button',{name:/Confirm weights in/}).count(),2);
    await dialog.getByRole('button',{name:'Skip weights for now',exact:true}).click();await dialog.waitFor({state:'hidden'});
    await review.getByRole('button',{name:'Fix next reading',exact:true}).click();
    await dialog.getByRole('heading',{name:'Shipment weights',exact:true}).waitFor();
    await dialog.getByRole('button',{name:'Close source',exact:true}).click();
    const check=page.locator('.scan-driver-check-v105 input');if(await check.count())await check.check();
    await page.getByRole('button',{name:/^Save document$|^Save for review$/}).click();await page.locator('.scan-saved-v105').waitFor();
    const beforeRecords=await savedRecords(page);assert.equal(beforeRecords.length,1);const beforeWeights=beforeRecords[0];
    await page.reload();await page.getByRole('button',{name:/^Documents/}).first().click();
    const recent=page.getByRole('region',{name:'Recent documents'});await recent.locator('.saved-document-row-v344').first().click();
    await recent.getByRole('button',{name:'Read again',exact:true}).click();
    const reread=recent.getByRole('region',{name:'Read saved document again'}),savedReview=reread.locator('.owned-reader-preview');
    await savedReview.getByRole('button',{name:'Fix next reading',exact:true}).click();
    await dialog.getByRole('heading',{name:'Shipment weights',exact:true}).waitFor();
    await dialog.getByRole('button',{name:'Skip weights for now',exact:true}).click();
    await dialog.getByRole('heading',{name:'Save this reading',exact:true}).waitFor();
    await dialog.getByText('3 items remain unchecked.',{exact:false}).waitFor();
    await dialog.getByRole('button',{name:'Review remaining',exact:true}).click();
    await dialog.getByRole('heading',{name:'Shipment weights',exact:true}).waitFor();
    await dialog.getByRole('button',{name:'View Net weight source',exact:true}).click();
    assert.equal(await dialog.getByLabel('Confirmed value',{exact:true}).inputValue(),'3373.90');
    await dialog.getByLabel('Source line highlight',{exact:true}).waitFor();
    await dialog.getByRole('button',{name:'lb (pounds)',exact:true}).click();
    assert.equal(await dialog.getByLabel('Confirmed value',{exact:true}).inputValue(),'3373.90 LB');
    await dialog.getByRole('button',{name:'Close source',exact:true}).click();
    await dialog.getByRole('heading',{name:'Shipment weights',exact:true}).waitFor();
    const chosen=name==='chromium'?'LB':'KG';
    await dialog.screenshot({path:output+'/'+name+'-grouped-weights.png'});
    await dialog.getByRole('button',{name:'Confirm weights in '+chosen,exact:false}).click();
    await dialog.getByRole('heading',{name:'Save this reading',exact:true}).waitFor();
    await dialog.getByText('All requested corrections are ready to save.',{exact:true}).waitFor();
    await reread.getByText('Confirmed changes saved on this device.',{exact:true}).waitFor();
    await dialog.getByRole('button',{name:'Return to document',exact:true}).click();
    const afterDownload=page.waitForEvent('download');await savedReview.getByRole('button',{name:'Export reading review',exact:true}).click();
    const confirmed=JSON.parse(fs.readFileSync(await (await afterDownload).path(),'utf8')),confirmedGroup=confirmed.documents.find(g=>g.kind==='bol');
    for(const key of ['netWeight','tareWeight','weight']){const f=confirmedGroup.fields[key];assert.equal(f.status,'confirmed');assert.ok(f.value.endsWith(' '+chosen));assert.equal(f.correction.unitOrigin,'human_selection');}
    assert.equal(confirmed.corrections.length,3);
    const weak=confirmedGroup.fields.weight.candidates.find(c=>c.numericValue==='3936.84');
    assert.ok(Math.abs(weak.evidence[0].recognizerConfidence-.3615)<.000001);
    assert.equal(confirmedGroup.checks.find(c=>c.id==='bol_weight_arithmetic').status,'passed');
    assert.equal(confirmedGroup.checks.find(c=>c.id==='bol_weight_arithmetic').unit,chosen);assert.equal(confirmedGroup.canAutoFile,false);
    await reread.getByRole('button',{name:'Save reading',exact:true}).click();
    await reread.getByText('Reading saved with this document. Find it under Reviewed document details.',{exact:true}).waitFor();
    await page.reload();
    const records=await savedRecords(page);
    assert.equal(records.length,1);const saved=records[0].extracted.readerReviewV110345;
    // The saved summary also counts supported source suggestions that have
    // never been human-confirmed. Those remain independent of the fix queue.
    const suggestions=Object.values(confirmedGroup.fields).filter(f=>f.status==='supported'&&f.value!=null).length;
    assert.equal(saved.remaining,suggestions);assert.equal(records[0].extracted.readerContinuityV110371.draft,null);
    for(const key of ['netWeight','tareWeight','weight'])assert.equal(saved.documents[0].fields[key].value,confirmedGroup.fields[key].value);
    assert.equal(records[0].load_no,beforeWeights.load_no,'unit confirmation preserves the original load assignment');
    assert.equal(records[0].sha256,beforeWeights.sha256,'unit confirmation preserves the original file');
    await page.getByRole('button',{name:/^Documents/}).first().click();await recent.locator('.saved-document-row-v344').first().click();
    await recent.getByRole('button',{name:'Read again',exact:true}).click();
    await reread.getByText('3 saved confirmations kept. Review a saved value to change it.',{exact:true}).waitFor();
    assert.equal(await savedReview.getByRole('button',{name:'Fix next reading',exact:true}).isDisabled(),true);
    assert.equal(await savedReview.getByRole('region',{name:'Review shipment weights',exact:true}).count(),0);
    await reread.screenshot({path:output+'/'+name+'-weights-retained.png'});
    assert.deepEqual(errors,[]);
    console.log('PASS '+name+' grouped Fix next reading, source return, skip, explicit '+chosen+', save checkpoint, reload and retained weight confirmations');
  }finally{await context.close();await instance.close();}
}
