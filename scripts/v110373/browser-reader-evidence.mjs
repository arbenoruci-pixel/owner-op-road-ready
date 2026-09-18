// Exercise the compiled Reader with a real synthetic PDF, never a customer file.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
import {resolveEvidence} from '../../packages/smart-reader-core/src/index.js';
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier),sheet=pdf.addPage([612,792]);
const draw=(page,text,x,y,size=10)=>page.drawText(text,{x,y,size,font});
draw(sheet,'PRO # 86420 Rate Confirmation',300,760);
draw(sheet,'Size & Type: POWER ONLY Description: TRAILER Miles: 987',30,640);
draw(sheet,'Pieces: Weight: 12000',30,610);
draw(sheet,'Unit # 123456 VIN # 1HGBH41JXMN109186',30,580);
draw(sheet,'TOTAL RATE 2300.00',30,550);
draw(sheet,'PICK 1',30,515);draw(sheet,'PICK UP',65,495);draw(sheet,'123 EXAMPLE RD',65,478);
draw(sheet,'Appointment 09/16/26 08:00 to 09/16/26 16:00',305,478,7);draw(sheet,'ALBANY NY 12207',65,464);
draw(sheet,'STOP 1',30,430);draw(sheet,'EXAMPLE RECEIVING LLC',65,410);draw(sheet,'456 SAMPLE ST',65,394);
draw(sheet,'Appointment 09/22/26 08:00 to 09/22/26 16:00',305,394,7);draw(sheet,'MADISON WI 53703',65,380);
draw(sheet,'$150 PER DAY LATE FEE, IF DELIVERED AFTER 7 DAYS',30,340,8);
draw(sheet,'POD must be provided within 4 hrs of delivery. Penalty for failure could apply',30,320,7);
draw(sheet,'Detention $25/hr Applicable after 3 free hours of loading and unloading.',30,300,7);
draw(sheet,'Send invoice to billing@example.test',30,280,8);
draw(sheet,'Document Ref: SYNTHETIC-ABO12 Page 1 of 2',30,35);
const signature=pdf.addPage([612,792]);draw(signature,'SIGNATURE PAGE',65,700);draw(signature,'Document Ref: SYNTHETIC-AB012 Page 2 of 2',30,35);
const cert=pdf.addPage([612,792]);
for(const [i,text]of ['REF. NUMBER DOCUMENT COMPLETED BY ALL PARTIES ON','SYNTHETIC-ABO12 16 SEP 2026 18:30:00','UTC','SIGNER TIMESTAMP SIGNATURE','SIGNED','Signed with PandaDoc'].entries())draw(cert,text,30,750-i*24);
const buffer=Buffer.from(await pdf.save()),output='browser-test-results/reader-evidence-v110373';fs.mkdirSync(output,{recursive:true});
for(const [name,browser]of [['chromium',chromium],['webkit',webkit]]){
 const instance=await browser.launch({headless:true}),context=await instance.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await setupRoutes(context);const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};await seed(page,state);
  await page.getByRole('button',{name:/Smart Scan/}).first().click();
  await page.locator('input[type=file][multiple]').first().setInputFiles({name:'synthetic-reader-evidence.pdf',mimeType:'application/pdf',buffer});
  await page.getByRole('button',{name:'Read document',exact:true}).click();
  await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
  const review=page.locator('.owned-reader-preview');await review.getByText('3 pages · 3 documents',{exact:true}).waitFor();
  const exportResult=async()=>{const event=page.waitForEvent('download');await review.getByRole('button',{name:'Export reading review',exact:true}).click();return JSON.parse(fs.readFileSync(await(await event).path(),'utf8'));};
  const result=await exportResult();fs.writeFileSync(`${output}/${name}-review.json`,JSON.stringify(result,null,2));
  assert.equal(result.engineVersion,'0.3.18');const f=result.documents[0].fields;
  for(const key of ['pickupAddress','deliveryAddress','pickupAppointment','deliveryAppointment','pickupDate','deliveryDate','consignee'])assert.equal(f[key].status,'supported',key);
  assert.equal(f.pickupAddress.value,'123 EXAMPLE RD, ALBANY NY 12207');assert.equal(f.deliveryAddress.value,'456 SAMPLE ST, MADISON WI 53703');
  assert.equal(f.totalRate.value,'2300.00');assert.equal(f.unitNumber.value,'123456');assert.equal(f.vin.value,'1HGBH41JXMN109186');
  assert.equal(f.weight.value,null);assert.equal(f.lateFeeTerms.value,'$150 PER DAY LATE FEE, IF DELIVERED AFTER 7 DAYS');
  assert.ok(f.podRequirement.value.includes('4 hrs'));assert.ok(f.detentionTerms.value.includes('3 free hours'));
  assert.equal(result.referenceWarnings.length,1);assert.equal(result.referenceWarnings[0].value,'SYNTHETIC-AB012');
  for(const doc of result.documents)for(const field of Object.values(doc.fields))for(const c of field.candidates){
   for(const e of [...c.evidence,...c.labelEvidence||[],...c.continuationEvidence||[]])resolveEvidence(result,e);
   assert.equal((c.labelEvidence||[]).length,new Set((c.labelEvidence||[]).map(e=>JSON.stringify(e))).size);
  }
  await review.getByRole('button',{name:'123 EXAMPLE RD, ALBANY NY 12207 · Page 1',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Check source',exact:true});await dialog.getByLabel('Source line highlight',{exact:true}).waitFor();
  await dialog.getByText('Address continuation:',{exact:false}).waitFor();
  assert.equal(await dialog.getByLabel('Confirmed value',{exact:true}).inputValue(),'123 EXAMPLE RD, ALBANY NY 12207');
  await dialog.screenshot({path:`${output}/${name}-address-source.png`});await dialog.getByRole('button',{name:'Close source',exact:true}).click();
  await review.getByRole('button',{name:'Check document reference',exact:true}).click();
  const signatureImage=dialog.getByRole('img',{name:'Source image for page 2',exact:true});await signatureImage.waitFor();await signatureImage.evaluate(image=>image.decode());
  assert.ok(await signatureImage.evaluate(image=>image.complete&&image.naturalWidth>0),'sparse signature page retains its source image');
  const signatureEvidence=result.documents[1].fields.documentReference.candidates[0].evidence[0];
  assert.ok(signatureEvidence.sourceImageId,'fallback evidence has its source identity before extraction');
  if(signatureEvidence.box)await dialog.getByLabel('Source line highlight',{exact:true}).waitFor();
  else assert.equal(await dialog.getByLabel('Source line highlight',{exact:true}).count(),0,'unpositioned text never receives a fabricated highlight');
  await dialog.screenshot({path:`${output}/${name}-signature-source.png`});
  assert.equal(await dialog.getByLabel('Confirmed value',{exact:true}).inputValue(),'SYNTHETIC-AB012');
  await dialog.getByLabel('Confirmed value',{exact:true}).fill('SYNTHETIC-ABO12');await dialog.getByRole('button',{name:'Confirm value',exact:true}).click();
  assert.equal(await review.locator('.reader-reference-warning-v373').count(),0);
  const corrected=await exportResult();assert.equal(corrected.referenceWarnings.length,0);assert.equal(corrected.corrections[0].sourceQuote,'SYNTHETIC-AB012');
  assert.equal(corrected.documents.length,3);assert.ok(corrected.documents.every(d=>!d.canAutoFile));assert.deepEqual(errors,[]);
  console.log(`PASS ${name}: actual PDF stop values, operational clauses, full address source, distinct references and explicit correction`);
 }catch(error){await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${name}-failure.json`,JSON.stringify({error:String(error),errors,body:await page.locator('body').innerText()},null,2));throw error;}
 finally{await context.close();await instance.close();}
}
