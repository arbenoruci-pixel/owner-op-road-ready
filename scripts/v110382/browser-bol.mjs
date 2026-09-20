// Real barcode pixels plus controlled OCR errors. Synthetic local data only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
const damaged=process.env.TEST_DAMAGED_BOL==='1';
const output=damaged?'browser-test-results/bol-recovery-v110383':'browser-test-results/bol-quality-v110382';fs.mkdirSync(output,{recursive:true});
const rows=[
  {text:'BILL OF LADING',x:60,y:35,w:450},
  {text:'BOL NO: 001234500',x:640,y:175,w:390,words:[['BOL',640,52],['NO:',710,45],['001234500',785,170]]},
  {text:'Ship Date: 7/14/2026',x:640,y:225,w:360},
  {text:'CARRIER: EXAMPLE TRANSPORT',x:70,y:340,w:570},
  {text:'FROM: EXAMPLE FOODS',x:70,y:405,w:570},
  {text:'CONSIGNEE: REGIONAL MARKET',x:70,y:465,w:620},
  {text:'PO#: 123456',x:70,y:525,w:300},
  {text:'TOTAL UNITS: 331',x:70,y:1330,w:380},
  {text:'TOTAL TARE: 562.94',x:70,y:1380,w:430},
  {text:'TOTAL NET WEIGHT: 3,373.90',x:620,y:1330,w:630},
  {text:'TOTAL WEIGHT: 3,936.84',x:620,y:1380,w:580},
  {text:'Frozen Loads: Use temp setting of -10F',x:70,y:1460,w:890}
];
if(damaged){
  rows.shift();
  rows[0]={...rows[0],text:'BA NO: 001234500',words:[['BA',640,52],['NO:',710,45],['001234500',785,170]]};
  const party=rows.find(r=>r.text.startsWith('CONSIGNEE:'));party.text='CONSIGNED';
  rows.push({text:'TO: REGIONAL MARKET',x:70,y:495,w:620});
  rows.push({text:'The original bill of Iading',x:70,y:1560,w:630});
}
for(const [name,browser]of [['chromium',chromium],['webkit',webkit]]){
  const instance=await browser.launch({headless:true}),context=await instance.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
  try{
    await setupRoutes(context);
    await context.addInitScript(rows=>{
      window.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async(file)=>{
        const bitmap=await createImageBitmap(file),w=bitmap.width,h=bitmap.height;bitmap.close();
        const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
        const tsv=[header,[1,1,0,0,0,0,0,0,w,h,-1,''].join('\t')];
        const detail=file.name==='road-ready-identifier-detail.png';
        const observed=detail?[{text:'BOL NO: 001234500',x:10,y:200,w:1250}]:rows;
        const x=v=>Math.round(v*w/1314),y=v=>Math.round(v*h/1700);
        for(const [i,row]of observed.entries())for(const [j,word]of (row.words||[[row.text,row.x,row.w]]).entries())tsv.push([5,1,i+1,1,1,j+1,x(word[1]),y(row.y),x(word[2]),Math.max(1,y(24)),96,word[0]].join('\t'));
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
    await barcode.getByText('Barcode: 0012345000',{exact:true}).waitFor();assert.match(await barcode.innerText(),/differs from the BOL reading/);
    await barcode.getByText('View barcode source',{exact:true}).click();await barcode.getByRole('img').waitFor();await barcode.getByRole('img').evaluate(img=>img.decode());
    assert.ok(await barcode.getByRole('img').evaluate(img=>img.naturalWidth>200));await barcode.screenshot({path:output+'/'+name+'-barcode-proof.png'});
    await barcode.getByRole('button',{name:'Check BOL number',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Check source',exact:true});await dialog.waitFor();
    await dialog.getByLabel('Source line highlight',{exact:true}).waitFor();
    await dialog.getByLabel('Confirmed value',{exact:true}).fill('0012345000');await dialog.getByRole('button',{name:'Confirm value',exact:true}).click();
    await barcode.getByText(/matches the confirmed BOL number/).waitFor();
    await review.getByRole('button',{name:'Check Total weight source',exact:true}).click();
    await dialog.getByLabel('Confirmed value',{exact:true}).fill('3936.84');await dialog.getByRole('button',{name:'Confirm value',exact:true}).click();
    await dialog.getByRole('alert').filter({hasText:/ambiguous or invalid/}).waitFor();await dialog.getByRole('button',{name:'Close source',exact:true}).click();
    const download=page.waitForEvent('download');await review.getByRole('button',{name:'Export reading review',exact:true}).click();
    const exported=await download,result=JSON.parse(fs.readFileSync(await exported.path(),'utf8')),group=result.documents.find(g=>g.kind==='bol');
    assert.equal(group.fields.bolNumber.value,'0012345000');assert.equal(group.fields.bolNumber.status,'confirmed');
    assert.equal(group.fields.weight.status,'needs_review');assert.equal(group.fields.temperature.value,'-10 F');
    assert.equal(group.checks.find(c=>c.id==='bol_weight_arithmetic').status,'passed');assert.equal(group.checks.find(c=>c.id==='bol_barcode_comparison').status,'passed');
    assert.equal(group.canAutoFile,false);assert.deepEqual(errors,[]);
    if(damaged){assert.equal(result.engineVersion,'0.3.20');assert.equal(group.identityStatus,'needs_review');}
    console.log('PASS '+name+' '+(damaged?'damaged BOL labels, ':'')+'actual barcode, crop proof, BOL correction, unit guard and exported evidence');
  }finally{await context.close();await instance.close();}
}
