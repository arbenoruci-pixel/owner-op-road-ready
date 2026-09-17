import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {baseState,seed,setupRoutes} from './v110328/browserFixture.mjs';

// Real PDF text, font metrics, native extraction and rendered evidence. All
// names/references are synthetic; this fixture never contains customer files.
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier);
const sheet=pdf.addPage([612,792]);
const draw=(page,text,x,y,size=10)=>page.drawText(text,{x,y,size,font});
draw(sheet,'PRO # 86420 Rate Confirmation',300,760);
draw(sheet,'EXAMPLE FREIGHT LLC',30,650);draw(sheet,'100 SAMPLE RD',30,635);draw(sheet,'ALBANY NY 12207',30,620);
for(const [i,letter] of [...'CARRIER'].entries())draw(sheet,letter,285,695-i*13);
draw(sheet,'EXAMPLE TRANSPORT LLC',305,693);draw(sheet,'(212) 555-0100 (p)',305,675);
draw(sheet,'MC # 123456',305,645);draw(sheet,'DOT 1234567',305,628);draw(sheet,'Driver SAMPLE DRIVER',305,611);
draw(sheet,'Size & Type: POWER ONLY Description: TRAILER Miles: 987',30,580);
draw(sheet,'TOTAL RATE 2300.00',30,550);
draw(sheet,'PICK 1',30,515);draw(sheet,'PICK UP',65,495);draw(sheet,'123 EXAMPLE RD',65,478);
draw(sheet,'Appointment 09/16/26 08:00 to 09/16/26 16:00',305,478,7);draw(sheet,'ALBANY NY 12207',65,464);
draw(sheet,'STOP 1',30,430);draw(sheet,'EXAMPLE RECEIVING LLC',65,410);draw(sheet,'456 SAMPLE ST',65,394);
draw(sheet,'Appointment 09/22/26 08:00 to 09/22/26 16:00',305,394,7);draw(sheet,'MADISON WI 53703',65,380);
draw(sheet,'Send Carrier Bills to the Address Above PRO # 86420 must appear on all Invoices',30,80,7);
draw(sheet,'Document Ref: SYNTHETIC-REFERENCE Page 1 of 2',30,35);
const cert=pdf.addPage([612,792]);
for(const [i,text] of ['REF. NUMBER DOCUMENT COMPLETED BY ALL PARTIES ON','SYNTHETIC-REFERENCE 16 SEP 2026 18:30:00','UTC',
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
    assert.equal(result.engineVersion,'0.3.16');
    assert.deepEqual(result.documents.map(d=>d.kind),['rate_confirmation','signing_certificate']);
    const fields=result.documents[0].fields;
    assert.equal(fields.totalRate.value,'2300.00');
    assert.ok(fields.carrier.candidates.some(c=>c.value==='EXAMPLE TRANSPORT LLC'));
    assert.ok(fields.broker.candidates.some(c=>c.value==='EXAMPLE FREIGHT LLC'));
    assert.equal(fields.pickupDate.candidates[0].value,'2026-09-16');
    assert.equal(fields.deliveryDate.candidates[0].value,'2026-09-22');
    assert.ok(result.pages[0].observations.some(o=>o.source==='pdf-text-layer'&&o.lines.some(l=>l.box)));
    await review.getByRole('button',{name:'2300.00 · Page 1',exact:true}).click();
    const highlight=review.getByLabel('Source line highlight',{exact:true});await highlight.waitFor();
    const top=await highlight.evaluate(el=>parseFloat(el.style.top));
    assert.ok(top>29&&top<31,'PDF highlight follows the printed total, including font ascent');
    await review.screenshot({path:`${output}/${name}-native-pdf-source.png`});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
    assert.deepEqual(errors,[]);console.log('PASS '+name+' native PDF: companies, linked dates, preserved source and aligned highlight');
  }catch(error){
    await page.screenshot({path:`${output}/${name}-native-pdf-failure.png`,fullPage:true}).catch(()=>{});
    fs.writeFileSync(`${output}/${name}-native-pdf-failure.txt`,JSON.stringify({error:String(error),errors,body:await page.locator('body').innerText()},null,2));throw error;
  }finally{await context.close();await instance.close();}
}
