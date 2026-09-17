import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {baseState,seed,setupRoutes} from './v110328/browserFixture.mjs';
import {resolveEvidence} from '../packages/smart-reader-core/src/index.js';

// Real PDF text, font metrics, native extraction and rendered evidence. All
// names/references are synthetic; this fixture never contains customer files.
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier);
const splitCells=process.env.TEST_NATIVE_CELLS==='1',caseName=splitCells?'native-pdf-cells':'native-pdf',totalY=splitCells?535:550;
const sheet=pdf.addPage([612,792]);
const draw=(page,text,x,y,size=10)=>page.drawText(text,{x,y,size,font});
if(splitCells){draw(sheet,'PRO #',300,760);draw(sheet,'86420',370,760,14);draw(sheet,'Rate Confirmation',430,760,9);}
else draw(sheet,'PRO # 86420 Rate Confirmation',300,760);
draw(sheet,'EXAMPLE FREIGHT LLC',30,650);draw(sheet,'100 SAMPLE RD',30,635);draw(sheet,'ALBANY NY 12207',30,620);
for(const [i,letter] of [...'CARRIER'].entries())draw(sheet,letter,285,695-i*13);
draw(sheet,'EXAMPLE TRANSPORT LLC',305,693);draw(sheet,'(212) 555-0100 (p)',305,675);
draw(sheet,'MC # 123456',305,645);draw(sheet,'DOT 1234567',305,628);draw(sheet,'Driver SAMPLE DRIVER',305,611);
if(splitCells){
  draw(sheet,'Size & Type:',30,580,9);draw(sheet,'POWER ONLY',115,580,9);draw(sheet,'Description: TRAILER',250,580,8);
  draw(sheet,'Miles:',430,580,9);draw(sheet,'987',485,580,9);draw(sheet,'Weight:',30,565,9);draw(sheet,'12000',100,565,9);
  draw(sheet,'LINE HAUL RATE',30,551);draw(sheet,'2300.00',190,551);draw(sheet,'TOTAL RATE',30,totalY);draw(sheet,'2300.00',190,totalY);
}else{draw(sheet,'Size & Type: POWER ONLY Description: TRAILER Miles: 987',30,580);draw(sheet,'TOTAL RATE 2300.00',30,totalY);}
draw(sheet,'PICK 1',30,515);draw(sheet,'PICK UP',65,495);draw(sheet,'123 EXAMPLE RD',65,478);
draw(sheet,'Appointment 09/16/26 08:00 to 09/16/26 16:00',305,478,7);draw(sheet,'ALBANY NY 12207',65,464);
draw(sheet,'STOP 1',30,430);draw(sheet,'EXAMPLE RECEIVING LLC',65,410);draw(sheet,'456 SAMPLE ST',65,394);
draw(sheet,'Appointment 09/22/26 08:00 to 09/22/26 16:00',305,394,7);draw(sheet,'MADISON WI 53703',65,380);
draw(sheet,'Send Carrier Bills to the Address Above PRO # 86420 must appear on all Invoices',30,80,7);
draw(sheet,'Document Ref: SYNTHETIC-REFERENCE Page 1 of 2',30,35);
const cert=pdf.addPage([612,792]);
if(splitCells){
  const heading='DOCUMENT COMPLETED BY ALL PARTIES ON',completion='16 SEP 2026 18:30:00',right=340+font.widthOfTextAtSize(heading,8);
  draw(cert,'REF. NUMBER',30,750,8);draw(cert,heading,340,750,8);
  draw(cert,'SYNTHETIC-REFERENCE',30,730);draw(cert,completion,right-font.widthOfTextAtSize(completion,9),730,9);draw(cert,'UTC',right-font.widthOfTextAtSize('UTC',8),717,8);
  for(const [i,text] of ['SIGNER TIMESTAMP SIGNATURE','SENT','EMAIL sample@example.test','SIGNED','15 SEP 2026 10:00:00','Signed with PandaDoc'].entries())draw(cert,text,30,660-i*24);
}else for(const [i,text] of ['REF. NUMBER DOCUMENT COMPLETED BY ALL PARTIES ON','SYNTHETIC-REFERENCE 16 SEP 2026 18:30:00','UTC',
  'SIGNER TIMESTAMP SIGNATURE','SENT','EMAIL sample@example.test','SIGNED','Signed with PandaDoc'].entries())draw(cert,text,30,750-i*24);
const buffer=Buffer.from(await pdf.save()),output='browser-test-results/owned-reader';fs.mkdirSync(output,{recursive:true});
for(const [name,browser] of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.TEST_BROWSER||process.env.TEST_BROWSER===name)){
  const instance=await browser.launch({headless:true}),context=await instance.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage();page.setDefaultTimeout(45000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await setupRoutes(context);const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};await seed(page,state);
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'synthetic-native-rate.pdf',mimeType:'application/pdf',buffer});
    await page.getByRole('button',{name:'Read document',exact:true}).click();
    await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
    const review=page.locator('.owned-reader-preview');await review.getByText('2 pages · 2 documents',{exact:true}).waitFor();
    const download=page.waitForEvent('download');await review.getByRole('button',{name:'Export reading review',exact:true}).click();
    const result=JSON.parse(fs.readFileSync(await(await download).path(),'utf8'));
    fs.writeFileSync(`${output}/${name}-${caseName}-review.json`,JSON.stringify(result,null,2));
    assert.equal(result.engineVersion,'0.3.17');
    assert.deepEqual(result.documents.map(d=>d.kind),['rate_confirmation','signing_certificate']);
    const fields=result.documents[0].fields;
    assert.equal(fields.totalRate.value,'2300.00');
    assert.ok(fields.carrier.candidates.some(c=>c.value==='EXAMPLE TRANSPORT LLC'));
    assert.ok(fields.broker.candidates.some(c=>c.value==='EXAMPLE FREIGHT LLC'));
    assert.equal(fields.pickupDate.candidates[0].value,'2026-09-16');
    assert.equal(fields.deliveryDate.candidates[0].value,'2026-09-22');
    assert.ok(result.pages[0].observations.some(o=>o.source==='pdf-text-layer'&&o.lines.some(l=>l.box)));
    if(splitCells){
      for(const key of ['loadNumber','totalRate','equipment','miles','weight'])assert.ok(fields[key].candidates.some(c=>c.evidence.some(e=>e.box)),key+' has positioned evidence');
      assert.equal(fields.weight.value,null);assert.ok(fields.weight.issues.includes('weight_unit_required'));
      const certificate=result.documents[1].fields;
      for(const field of Object.values(certificate))assert.ok(field.candidates.some(c=>c.evidence.some(e=>e.box)));
      assert.equal(certificate.date.candidates[0].value,'2026-09-16');
      for(const doc of result.documents)for(const field of Object.values(doc.fields))for(const c of field.candidates)
        for(const e of [...c.evidence,...c.labelEvidence||[],...c.continuationEvidence||[]])resolveEvidence(result,e);
    }
    await review.getByRole('button',{name:'2300.00 · Page 1',exact:true}).click();
    const highlight=review.getByLabel('Source line highlight',{exact:true});await highlight.waitFor();
    const top=await highlight.evaluate(el=>parseFloat(el.style.top));
    const baseline=(792-totalY)/792*100;
    assert.ok(top>baseline-1.5&&top<baseline,'PDF highlight follows the total row rather than the identical line-haul amount');
    if(splitCells){const left=await highlight.evaluate(el=>parseFloat(el.style.left));assert.ok(left>30&&left<33,'highlight uses the amount cell');}
    await review.screenshot({path:`${output}/${name}-${caseName}-source.png`});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
    assert.deepEqual(errors,[]);console.log('PASS '+name+' '+caseName+': companies, linked dates, preserved source and aligned highlight');
  }catch(error){
    await page.screenshot({path:`${output}/${name}-${caseName}-failure.png`,fullPage:true}).catch(()=>{});
    fs.writeFileSync(`${output}/${name}-${caseName}-failure.txt`,JSON.stringify({error:String(error),errors,body:await page.locator('body').innerText()},null,2));throw error;
  }finally{await context.close();await instance.close();}
}
