import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation} from '../src/index.js';
import {guardDocumentReading,isDocumentParty} from '../src/fieldGuards.js';
import {mergedReceiptInput} from './merged-receipt-fixture.mjs';

test('one good OCR pass recognizes merged receipt fields and verifies exact source amounts',()=>{
  const input=mergedReceiptInput(),before=structuredClone(input),result=readDocument(input),doc=result.documents[0];
  assert.equal(doc.kind,'unloading_receipt');assert.equal(doc.identityStatus,'supported');
  for(const [key,value] of Object.entries({receiptNumber:'R-17',receiptDate:'2026-07-17',carrier:'Example Transport',poNumber:'ORDER-22',trailerNumber:'T-700',amount:'180.00',fee:'5.00',total:'185.00'}))assert.equal(doc.fields[key].value,value,key);
  assert.equal(doc.checks[0].status,'passed');assert.equal(doc.fields.currency.value,null);
  for(const f of Object.values(doc.fields))for(const c of f.candidates)for(const e of c.evidence){
    const {line}=resolveEvidence(result,e);assert.equal(line.text.slice(e.start,e.end),e.quote);
  }
  const total=doc.fields.total.candidates[0].evidence[0];
  assert.equal(total.quote,'$185.00');assert.equal(total.start,'THANK YOU FOR YOUR BUSINESS NET TOTAL '.length);
  assert.deepEqual(input,before);
});

test('qualified and instructional rows cannot supply receipt classification or a current total',()=>{
  for(const prefix of ['Previous ','Estimated ','Please enter ','Example ','Attach ']){
    const input=mergedReceiptInput(),lines=input.pages[0].observations[0].lines;
    lines.find(l=>l.text.startsWith('PO No:')).text=prefix+'PO No: ORDER-22 Load Description: Breakdown';
    assert.equal(readDocument(input).documents[0].kind,'unknown',prefix);
  }
  for(const text of ['Previous NET TOTAL $185.00','Estimated TOTAL $185.00','Please pay NET TOTAL $185.00','THANK YOU FOR YOUR BUSINESS PREVIOUS NET TOTAL $185.00','THANK YOU FOR YOUR BUSINESS NET TOTAL $185.00 from an earlier receipt']){
    const input=mergedReceiptInput();input.pages[0].observations[0].lines.find(l=>l.text.startsWith('THANK YOU')).text=text;
    const doc=readDocument(input).documents[0];assert.equal(doc.kind,'unloading_receipt');assert.equal(doc.fields.total.value,null,text);assert.equal(doc.checks[0].status,'not_checked');
  }
});

test('merged receipt arithmetic conflicts remain reviewable across observations',()=>{
  const input=mergedReceiptInput(),retry=structuredClone(input.pages[0].observations[0]);retry.id='retry';
  retry.lines.find(l=>l.text.startsWith('THANK YOU')).text='THANK YOU FOR YOUR BUSINESS NET TOTAL $18500';input.pages[0].observations.push(retry);
  const doc=readDocument(input).documents[0];assert.equal(doc.fields.total.value,null);assert.ok(doc.fields.total.issues.includes('conflicting_reads'));assert.equal(doc.checks[0].status,'not_checked');
  const mismatch=mergedReceiptInput();mismatch.pages[0].observations[0].lines.find(l=>l.text.startsWith('THANK YOU')).text='THANK YOU FOR YOUR BUSINESS NET TOTAL $190.00';
  const bad=readDocument(mismatch).documents[0];assert.equal(bad.checks[0].status,'needs_review');assert.equal(bad.fields.total.value,null);
});

test('customer PO labels remain distinct from BOL identity and cannot become company names',()=>{
  for(const label of ['Customer P.O. Number:','Customer PO No:','Customer PO. #:','P.O. Number:','PURCHASE ORDER:']){
    const observation=textObservation(`BILL OF LADING - NOT NEGOTIABLE\nSHIP FROM Bill of Lading Number: B-22\nSHIP TO: Example Market\nBOL NO: B-22\n${label} ORDER-77`);
    const result=readDocument({documentId:'form-labels',pages:[{observations:[observation]}]}),doc=result.documents[0];
    assert.equal(doc.kind,'bol');assert.equal(doc.fields.bolNumber.value,'B-22');assert.equal(doc.fields.poNumber.value,'ORDER-77',label);
    assert.equal(doc.fields.shipper.value,null);assert.ok(doc.fields.shipper.candidates.every(c=>c.issue==='form_instructions'));
    assert.equal(doc.fields.consignee.value,'Example Market');
    const e=doc.fields.poNumber.candidates[0].evidence[0];assert.equal(e.quote,'ORDER-77');resolveEvidence(result,e);
  }
  for(const value of ['Bill of Lading Number: B-22','B/L NO.: B-22','Customer P.O. Number: ORDER-77','Receipt # R-17','DATE: 17-Jul-2026'])assert.equal(isDocumentParty(value),false,value);
  for(const value of ['BOL Transport','Invoice Logistics','Trailer Depot','PO Logistics','No. 1 Transport'])assert.equal(isDocumentParty(value),true,value);
  const guarded=guardDocumentReading({fields:{shipper:'Bill of Lading Number: B-22',origin:'Bill of Lading Number: B-22',consignee:'Example Market'}});
  assert.equal(guarded.fields.shipper,'');assert.equal(guarded.fields.origin,'');assert.equal(guarded.fields.consignee,'Example Market');
});
