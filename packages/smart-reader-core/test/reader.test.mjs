import assert from 'node:assert/strict';
import test from 'node:test';
import {readDocument,textObservation,resolveEvidence,buildRereadRequests,confirmField,exportCorrections,rereadRegions} from '../src/index.js';

const invoice=(id='INV-17',extra='')=>`INVOICE\nInvoice No: ${id}\nVendor: Example Company\nDate: 2026-09-13\nSubtotal: 100.00\nTax: 8.25\nTotal: 108.25\nCurrency: USD${extra}`;
const bol=(id='BOL-42',extra='')=>`BILL OF LADING\nBOL No: ${id}\nShip From: Example Shipper\nShip To: Example Receiver\nWeight: 12000 LB${extra}`;
const page=(text,id='p1')=>({id,observations:[textObservation(text)]});
const read=(...pages)=>readDocument({documentId:'doc-1',pages});

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
