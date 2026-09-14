import assert from 'node:assert/strict';
import test from 'node:test';
import {readDocument,textObservation,resolveEvidence,buildRereadRequests,confirmField,exportCorrections,rereadRegions} from '../src/index.js';
import {shippingLayoutInput} from './shipping-layout-fixture.mjs';

const invoice=(id='INV-17',extra='')=>`INVOICE\nInvoice No: ${id}\nVendor: Example Company\nDate: 2026-09-13\nSubtotal: 100.00\nTax: 8.25\nTotal: 108.25\nCurrency: USD${extra}`;
const bol=(id='BOL-42',extra='')=>`BILL OF LADING\nBOL No: ${id}\nShip From: Example Shipper\nShip To: Example Receiver\nWeight: 12000 LB${extra}`;
const page=(text,id='p1')=>({id,observations:[textObservation(text)]});
const read=(...pages)=>readDocument({documentId:'doc-1',pages});

test('non-negotiable headings and interleaved shipping blocks retain exact evidence and uncertainty',()=>{
  const result=readDocument(shippingLayoutInput()),group=result.documents[0];
  assert.equal(group.kind,'bol');assert.equal(result.pageCount,1);
  assert.equal(group.fields.bolNumber.status,'missing');
  assert.equal(group.fields.documentDate.status,'missing','unlabeled and commodity dates are not document dates');
  assert.equal(group.fields.trailerNumber.status,'missing','a street number in the other column is not a trailer');
  assert.deepEqual(group.fields.shipper.candidates.map(c=>c.rawValue).sort(),['Example Foods Ing','Example Foods Inc'].sort());
  assert.equal(group.fields.shipper.value,null);
  assert.ok(group.fields.shipper.issues.includes('conflicting_reads'));
  assert.ok(group.fields.shipper.issues.includes('layout_needs_review'));
  assert.equal(group.fields.consignee.status,'needs_review');
  assert.ok(group.fields.consignee.issues.includes('weak_recognition'));
  for(const field of Object.values(group.fields))for(const candidate of field.candidates)for(const evidence of [...candidate.evidence,...(candidate.labelEvidence||[])]){
    const {line}=resolveEvidence(result,evidence);assert.equal(evidence.quote,line.text.slice(evidence.start,evidence.end));
  }
  const candidate=group.fields.shipper.candidates.find(c=>c.rawValue==='Example Foods Inc');
  const corrected=confirmField(result,{documentId:result.documentId,groupId:group.id,field:'shipper',rawValue:'Example Foods Inc',evidence:candidate.evidence[0],userConfirmed:true,expectedRevision:0,expectedRawValues:group.fields.shipper.candidates.map(c=>c.rawValue)});
  assert.equal(corrected.documents[0].fields.shipper.status,'confirmed');
  assert.equal(corrected.documents[0].fields.shipper.value,'Example Foods Inc');
  assert.equal(corrected.documents[0].canAutoFile,false);
});

test('shipping block geometry never skips an unreadable first row or guesses a central column',()=>{
  for(const mode of ['no-boxes','central-label','address-only','side-by-side']){
    const input=shippingLayoutInput();input.pages[0].observations.splice(1);
    const lines=input.pages[0].observations[0].lines;
    // Keep the title within the text-only heading window for this test.
    lines.splice(0,24);
    lines.splice(lines.findIndex(line=>line.text.startsWith('Shipper Signature')),1);
    const label=lines.find(line=>line.text==='SHIP FROM'),name=lines.find(line=>line.text==='Example Foods Ing');
    if(mode==='no-boxes')for(const line of lines)delete line.box;
    if(mode==='central-label')label.box.x=.46;
    if(mode==='address-only')lines.splice(lines.indexOf(name),1);
    if(mode==='side-by-side')lines.push({...structuredClone(name),text:'Other Company',box:{...name.box,x:.30,width:.15}});
    const field=readDocument(input).documents[0].fields.shipper;
    assert.equal(field.status,'missing',mode);
    assert.equal(field.value,null,mode);
  }
});

test('multiword street names, common suffixes and PO boxes cannot become party proposals',()=>{
  for(const address of ['123 North Main Street','123 Main Boulevard','123 N Main St. Suite 2','44 South County Road 10','95 Industrial Parkway','5 East Oak Lane','P.O. Box 42']){
    const input=shippingLayoutInput();
    for(const observation of input.pages[0].observations){
      observation.lines=observation.lines.filter(line=>!line.text.startsWith('Shipper Signature'));
      observation.lines.find(line=>line.text.startsWith('Example Foods')).text=address;
    }
    const field=readDocument(input).documents[0].fields.shipper;
    assert.equal(field.status,'missing',address);assert.equal(field.candidates.length,0,address);
  }
});

test('invoice extraction has exact resolvable source ranges and safe arithmetic',()=>{
  const result=read(page(invoice()));
  const group=result.documents[0];
  assert.equal(group.kind,'invoice');
  assert.equal(group.fields.total.value,'108.25');
  assert.equal(group.checks[0].status,'passed');
  for(const field of Object.values(group.fields))for(const candidate of field.candidates)for(const evidence of candidate.evidence){
    const {line}=resolveEvidence(result,evidence);
    assert.equal(line.text.slice(evidence.start,evidence.end),evidence.quote);
  }
  assert.equal(result.calibration.automaticAcceptance,false);
  assert.equal(group.canAutoFile,false);
});

test('BOL identifiers remain distinct from PO numbers and load numbers',()=>{
  const result=read(page(bol('00123','\nPO No: ABC-10\nLoad No: OTHER-99')));
  const fields=result.documents[0].fields;
  assert.equal(fields.bolNumber.value,'00123');
  assert.equal(fields.poNumber.value,'ABC-10');
  assert.equal(fields.loadNumber,undefined);
});

test('same type with different IDs creates separate documents in page order',()=>{
  const result=read(page(invoice('INV-1'),'a'),page(invoice('INV-2'),'b'),page(bol(),'c'));
  assert.deepEqual(result.documents.map(d=>[d.kind,d.pageIds]),[['invoice',['a']],['invoice',['b']],['bol',['c']]]);
});

test('explicit shared identity joins a continuation page without a repeated heading',()=>{
  const result=read(page(bol(),'a'),page('BOL No: BOL-42\nPage 2 of 2\nAdditional notes','b'));
  assert.equal(result.documents.length,1);
  assert.deepEqual(result.documents[0].pageIds,['a','b']);
});

test('page numbering alone cannot combine unrelated or unreadable pages',()=>{
  const result=read(page(bol(),'a'),page('Page 2 of 2\nTerms','b'),page('','c'));
  assert.equal(result.documents.length,3);
  assert.deepEqual(result.unreadablePageIds,['c']);
  assert.equal(result.pageCount,3);
  assert.equal(result.documents[1].boundaryReview,true);
});

test('retry disagreement remains a conflict even when two reads agree',()=>{
  const result=read({id:'a',observations:[textObservation(invoice('INV-1'),{id:'one'}),textObservation(invoice('INV-2'),{id:'two'}),textObservation(invoice('INV-1'),{id:'three'})]});
  assert.equal(result.pageCount,1);
  assert.equal(result.documents[0].fields.invoiceNumber.value,null);
  assert.ok(result.documents[0].fields.invoiceNumber.issues.includes('conflicting_reads'));
});

test('mentions inside instructions cannot classify a document',()=>{
  const result=read(page('Instructions\nSend the INVOICE with subtotal and total.\nAttach BILL OF LADING.\nShip From: A\nShip To: B'));
  assert.equal(result.documents[0].kind,'unknown');
  assert.deepEqual(result.documents[0].fields,{});
});

test('conflicting headings on the same page require classification review',()=>{
  const result=read(page(invoice()+'\n'+bol()));
  assert.equal(result.documents[0].kind,'unknown');
  assert.equal(result.pageIdentities[0].status,'conflicting');
});

test('ambiguous dates, impossible dates, amounts and currencies stay unresolved',()=>{
  for(const raw of ['09/10/2026','2026-02-30']){
    const result=read(page(invoice().replace('2026-09-13',raw)));
    assert.equal(result.documents[0].fields.invoiceDate.value,null);
    assert.equal(result.documents[0].fields.invoiceDate.status,'needs_review');
  }
  const result=read(page(invoice().replace('108.25','1,234').replace('Currency: USD','Currency: $')));
  assert.equal(result.documents[0].fields.total.value,null);
  assert.equal(result.documents[0].fields.currency.value,null);
});

test('decimal math does not invent missing taxes or repair inconsistent totals',()=>{
  const mismatch=read(page(invoice().replace('108.25','118.25'))).documents[0];
  assert.equal(mismatch.checks[0].status,'needs_review');
  assert.equal(mismatch.fields.total.value,null);
  assert.equal(mismatch.fields.total.candidates[0].rawValue,'118.25');
  const missing=read(page(invoice().replace('Tax: 8.25\n',''))).documents[0];
  assert.equal(missing.fields.tax.value,null);
  assert.equal(missing.checks[0].status,'not_checked');
});

test('weak recognition cannot produce a supported field',()=>{
  const p=page(invoice());p.observations[0].lines[1].confidence=.3;
  assert.equal(read(p).documents[0].fields.invoiceNumber.value,null);
});

test('reread regions come from source geometry and keep original image identity',()=>{
  const p=page(invoice());p.observations[0].sourceImageId='original-image';
  p.observations[0].lines[1].confidence=.4;
  p.observations[0].lines[1].box={x:.1,y:.2,width:.4,height:.03};
  const result=read(p),requests=buildRereadRequests(result);
  assert.equal(requests.length,1);
  assert.equal(requests[0].sourceImageId,'original-image');
  assert.equal(requests[0].boxScope,'line');
  assert.deepEqual(requests[0].box,p.observations[0].lines[1].box);
  delete p.observations[0].lines[1].box;
  assert.deepEqual(buildRereadRequests(read(p)),[],'missing coordinates are never invented');
});

test('corrections are explicit, source-bound, immutable, and excluded from training by default',()=>{
  const result=read(page(invoice())),before=JSON.stringify(result),field=result.documents[0].fields.invoiceNumber;
  const args={documentId:'doc-1',groupId:'document-1',field:'invoiceNumber',rawValue:'INV-18',evidence:field.candidates[0].evidence[0],userConfirmed:true,expectedRevision:0,expectedRawValues:['INV-17']};
  const corrected=confirmField(result,args);
  assert.equal(JSON.stringify(result),before);
  assert.equal(corrected.documents[0].fields.invoiceNumber.value,'INV-18');
  assert.equal(corrected.corrections[0].sourceQuote,'INV-17');
  assert.equal(exportCorrections(corrected)[0].trainingEligible,false);
  assert.throws(()=>confirmField(corrected,args),/latest revision/);
  assert.throws(()=>confirmField(result,{...args,userConfirmed:false}));
  assert.throws(()=>confirmField(result,{...args,expectedRawValues:['stale']}));
  assert.throws(()=>confirmField(result,{...args,documentId:'another-document'}));
  assert.throws(()=>confirmField(result,{...args,evidence:{...args.evidence,quote:'forged'}}));
});

test('input validation rejects duplicate identities and invalid geometry',()=>{
  assert.throws(()=>read(page('a','x'),page('b','x')));
  const p=page(invoice());p.observations[0].lines[0].box={x:0,y:0,width:.2,height:.1};
  assert.throws(()=>read(p),/sourceImageId/);
  p.observations[0].sourceImageId='image';p.observations[0].lines[0].box.x=2;
  assert.throws(()=>read(p),/source box/);
});

test('serialized results reopen with valid evidence and ordered page accounting',()=>{
  const result=read(page(invoice(),'third'),page(bol(),'first'));
  const restored=JSON.parse(JSON.stringify(result));
  assert.deepEqual(restored.documents.flatMap(d=>d.pageIds),['third','first']);
  const evidence=restored.documents[0].fields.total.candidates[0].evidence[0];
  assert.equal(resolveEvidence(restored,evidence).page.id,'third');
});

test('a reused invoice number from a different vendor cannot join the document',()=>{
  const result=read(page(invoice(),'a'),page(invoice().replace('Example Company','Other Company'),'b'));
  assert.equal(result.documents.length,2);
});

test('targeted rereading preserves disagreement, original observations and page count',async()=>{
  const p=page(invoice());p.observations[0].sourceImageId='pixels-a';
  p.observations[0].lines[1].confidence=.4;
  p.observations[0].lines[1].box={x:.1,y:.1,width:.6,height:.04};
  const result=read(p),before=JSON.stringify(result);
  const next=await rereadRegions(result,{id:'owned-reader-test',async recognizeRegion(request){
    assert.equal(request.sourceImageId,'pixels-a');
    return {text:'Invoice No: INV-19'};
  }});
  assert.equal(next.pageCount,1);
  assert.equal(next.pages[0].observations.length,2);
  assert.ok(next.documents[0].fields.invoiceNumber.issues.includes('conflicting_reads'));
  assert.equal(JSON.stringify(result),before);
  const controller=new AbortController();
  await assert.rejects(()=>rereadRegions(result,{id:'test',async recognizeRegion(){controller.abort();return {text:'Invoice No: INV-19'};}},{signal:controller.signal}),{name:'AbortError'});
  const failed=await rereadRegions(result,{id:'test',async recognizeRegion(){throw new Error('test failure');}});
  assert.equal(failed.reread.failures.length,1);
  assert.equal(failed.pages[0].observations.length,1);
});

test('weak identity evidence on either page cannot join BOL or invoice pages',()=>{
  for(const [documentText,reference] of [[bol(),'BOL No: BOL-42'],[invoice(),'Invoice No: INV-17']]){
    for(const weakPage of ['first','continuation']){
      const first=page(documentText,'a'),continuation=page(reference+'\nPage 2 of 2','b');
      (weakPage==='first'?first.observations[0].lines[1]:continuation.observations[0].lines[0]).confidence=.3;
      const result=read(first,continuation);
      assert.equal(result.documents.length,2,weakPage+' '+reference);
      assert.equal(result.documents[1].boundaryReview,true);
    }
    const first=page(documentText,'a'),continuation=page(reference,'b');
    const weak=textObservation(reference.replace(/17|42/,'19'),{id:'weak-retry'});weak.lines[0].confidence=.3;
    continuation.observations.push(weak);
    assert.equal(read(first,continuation).documents.length,2,'a weak conflicting retry cannot be ignored');
    continuation.observations.pop();continuation.observations[0].lines[0].confidence=.96;
    assert.equal(read(first,continuation).documents.length,1,'supported references still join');
  }
});

function confirmAmount(result,key,rawValue){
  const field=result.documents[0].fields[key];
  return confirmField(result,{documentId:result.documentId,groupId:'document-1',field:key,rawValue,
    evidence:field.candidates[0].evidence[0],userConfirmed:true,expectedRevision:result.reviewRevision,
    expectedRawValues:field.candidates.map(candidate=>candidate.rawValue)});
}

test('amount corrections recompute arithmetic and export warnings until repaired',()=>{
  const original=read(page(invoice()));
  const changed=confirmAmount(original,'total','118.25');
  assert.equal(original.documents[0].checks[0].status,'passed','input remains immutable');
  assert.equal(changed.documents[0].checks[0].status,'needs_review');
  assert.equal(changed.documents[0].fields.total.value,null);
  assert.equal(changed.documents[0].fields.total.correction.value,'118.25','human correction is retained');
  assert.equal(exportCorrections(changed)[0].validationChecks[0].status,'needs_review');
  const stillWrong=confirmAmount(changed,'subtotal','100.00');
  assert.equal(stillWrong.documents[0].checks[0].status,'needs_review');
  const repaired=confirmAmount(stillWrong,'tax','18.25');
  assert.equal(repaired.documents[0].checks[0].status,'passed');
  for(const [key,value] of [['subtotal','100.00'],['tax','18.25'],['total','118.25']]){
    const field=repaired.documents[0].fields[key];
    assert.equal(field.value,value);assert.equal(field.status,'confirmed');assert.deepEqual(field.issues,[]);
  }
  assert.equal(repaired.documents[0].canAutoFile,false);
});

test('correcting an original mismatch restores supported amounts without accepting weak OCR',()=>{
  const mismatch=read(page(invoice().replace('108.25','118.25')));
  const repaired=confirmAmount(mismatch,'total','108.25');
  assert.equal(repaired.documents[0].checks[0].status,'passed');
  assert.equal(repaired.documents[0].fields.subtotal.status,'supported');
  const weak=page(invoice());weak.observations[0].lines[5].confidence=.3;
  const unresolved=confirmAmount(read(weak),'total','118.25');
  assert.equal(unresolved.documents[0].checks[0].status,'not_checked');
  assert.equal(unresolved.documents[0].fields.tax.value,null);
  assert.ok(unresolved.documents[0].fields.tax.issues.includes('weak_recognition'));
});

test('BOL boilerplate cannot become an identifier or a party name',()=>{
  const result=read(page(bol().replace('BOL No: BOL-42','BILL OF LADING NOT NEGOTIABLE').replace('Example Shipper','Signature/Date Trailer Loaded: Freight Counted Carrier Signature/Date').replace('Example Receiver','. Carrier Name: eg')+'\nCARRIER ack; t of packages and required placards.'));
  const fields=result.documents[0].fields;
  assert.deepEqual(fields.bolNumber.candidates,[]);
  for(const key of ['shipper','consignee','carrier']){assert.equal(fields[key].value,null);assert.ok(fields[key].issues.includes('form_instructions'));}
  for(const label of ['BOL:', 'BOL ID', 'BOL NUMBER', 'BOL No.'])assert.equal(read(page(bol().replace('BOL No:',label))).documents[0].fields.bolNumber.value,'BOL-42');
  assert.equal(read(page(bol().replace('Example Shipper','Signature Logistics LLC'))).documents[0].fields.shipper.value,'Signature Logistics LLC');
});


test('short and stylized company names stay valid and protect document boundaries',()=>{
  for(const name of ['3M','GE','H&M','Signature Foods','Sign Company']){
    const result=read(page(invoice().replace('Example Company',name)));
    assert.equal(result.documents[0].fields.vendor.value,name);
    assert.equal(result.documents[0].fields.vendor.status,'supported');
  }
  const result=read(page(invoice().replace('Example Company','3M'),'a'),page(invoice().replace('Example Company','GE'),'b'));
  assert.equal(result.documents.length,2,'different short vendor names cannot join on a reused invoice number');
});
