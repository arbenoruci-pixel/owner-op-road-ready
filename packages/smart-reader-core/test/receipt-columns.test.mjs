import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';
import {receiptColumnsInput} from './receipt-columns-fixture.mjs';

test('three receipt reads retain classification, distinct columns and exact monetary evidence',()=>{
  const input=receiptColumnsInput(),before=structuredClone(input),result=readDocument(input),doc=result.documents[0];
  assert.equal(doc.kind,'unloading_receipt');
  for(const [key,value] of Object.entries({receiptNumber:'RC-51',receiptDate:'2026-07-17',carrier:'Example Transport',location:'Example Warehouse',poNumber:'PO-51',trailerNumber:'T-700',amount:'388.00',fee:'10.00',total:'398.00'})){
    assert.equal(doc.fields[key].value,value,key);
    assert.equal(doc.fields[key].status,'supported',key);
  }
  assert.equal(doc.checks[0].status,'passed');
  assert.equal(doc.canAutoFile,false);
  const fee=doc.fields.fee.candidates[0];
  assert.equal(fee.evidence.length,3);
  for(const evidence of [...fee.evidence,...fee.labelEvidence])resolveEvidence(result,evidence);
  assert.ok(fee.evidence.every(e=>e.quote==='$10.00'&&e.supportMethod==='aligned_receipt_row'));
  assert.ok(fee.labelEvidence.every(e=>e.quote==='Checkout Fee'));
  assert.deepEqual(input,before);
});

test('weak labels, weak amounts and tall boxes retain manual review',()=>{
  for(const change of [
    lines=>{lines.find(l=>l.text==='Checkout Fee').confidence=.4;},
    lines=>{lines.find(l=>l.text==='$10.00').confidence=.4;},
    lines=>{lines.find(l=>l.text==='$10.00').box.height=.04;}
  ]){
    const input=receiptColumnsInput();input.pages[0].observations.splice(0,1);
    for(const observation of input.pages[0].observations)change(observation.lines);
    const fee=readDocument(input).documents[0].fields.fee;
    assert.equal(fee.value,null);assert.equal(fee.status,'needs_review');
  }
});

test('one clear column reading still needs review until a second read agrees',()=>{
  const input=receiptColumnsInput();input.pages[0].observations=[input.pages[0].observations[1]];
  const fee=readDocument(input).documents[0].fields.fee;
  assert.equal(fee.value,null);assert.ok(fee.issues.includes('layout_needs_review'));
});

test('competing values on a receipt row stay ambiguous despite a matching clean read',()=>{
  const input=receiptColumnsInput(),lines=input.pages[0].observations[0].lines;
  lines.push({id:'second-fee',text:'$20.00',confidence:.96,box:{x:.91,y:.595,width:.06,height:.012}});
  const doc=readDocument(input).documents[0];
  assert.equal(doc.kind,'unloading_receipt');
  assert.equal(doc.fields.fee.value,null);
  assert.ok(doc.fields.fee.issues.includes('ambiguous_receipt_row'));
  assert.equal(doc.checks[0].status,'not_checked');
});

test('different column amounts and failed receipt arithmetic stay unresolved',()=>{
  const input=receiptColumnsInput();
  input.pages[0].observations[1].lines.find(l=>l.text==='$10.00').text='$20.00';
  let doc=readDocument(input).documents[0];
  assert.equal(doc.fields.fee.value,null);
  assert.ok(doc.fields.fee.issues.includes('conflicting_reads'));
  const mismatch=receiptColumnsInput();
  for(const o of mismatch.pages[0].observations)o.lines.find(l=>l.text==='$398.00').text='$399.00';
  doc=readDocument(mismatch).documents[0];
  assert.equal(doc.fields.total.value,null);assert.equal(doc.checks[0].status,'needs_review');
});
