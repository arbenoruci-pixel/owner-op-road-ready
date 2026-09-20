import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,textObservation,resolveEvidence} from '../src/index.js';

// Reduced reproduction: one OCR pass damages LOAD DETAILS and leaves a
// generic receipt vote; another reads the unloading structure and receipt ID.
const generic=()=>textObservation('RECEIPT\nRECEIPT # RC-51 DATE: 17-Jul-2026\nLOAD DETAI Ls\nLoad Description: Breakdown pallets\nRELAY PAYMENT DETAILS\nAmount $388.00\nCheckout Fee $10.00\nNET TOTAL $398.00\nTotal Amount includes other purchase orders covered by this receipt',{id:'clean'});
const unloading=()=>textObservation('RECEIPT # RC-51\nDATE: 17-Jul-2026\nLOAD DETAILS\nLoad Description: Breakdown pallets\nRELAY PAYMENT DETAILS\nAmount $388.00\nCheckout Fee $10.00\nNET TOTAL $398.00',{id:'table'});
const read=observations=>readDocument({documentId:'receipt-consensus',pages:[{id:'p1',observations}]});

test('matching receipt references refine a generic OCR read into unloading receipt',()=>{
  assert.equal(read([generic()]).documents[0].kind,'other_expense');
  for(const observations of [[generic(),unloading()],[unloading(),generic()]]){
    const before=structuredClone(observations),result=read(observations),doc=result.documents[0];
    assert.equal(doc.kind,'unloading_receipt');
    assert.equal(doc.reference,'RC-51');
    assert.equal(doc.fields.receiptDate.value,'2026-07-17');
    assert.equal(doc.fields.amount.value,'388.00');
    assert.equal(doc.fields.fee.value,'10.00');
    assert.equal(doc.fields.total.value,'398.00');
    assert.equal(doc.canAutoFile,false);
    assert.equal(doc.requiresReview,true);
    assert.deepEqual(observations,before);
    for(const field of Object.values(doc.fields))for(const candidate of field.candidates)
      for(const evidence of candidate.evidence)resolveEvidence(result,evidence);
  }
});

test('missing, different, weak and conflicting references preserve the classification conflict',()=>{
  for(const change of [
    obs=>{obs.lines=obs.lines.filter(line=>!line.text.startsWith('RECEIPT #'));},
    obs=>{obs.lines[1].text=obs.lines[1].text.replace('RC-51','RC-99');},
    obs=>{obs.lines[1].confidence=.3;},
    obs=>{obs.lines.push({id:'other-receipt',text:'RECEIPT # RC-99'});}
  ]){
    const obs=generic();change(obs);
    const result=read([obs,unloading()]);
    assert.equal(result.documents[0].kind,'unknown');
    assert.equal(result.pageIdentities[0].status,'conflicting');
  }
});

test('specific competing receipt types remain conflicting even with a matching receipt number',()=>{
  const fuel=textObservation('FUEL RECEIPT\nReceipt # RC-51\nDate: 2026-07-17\nDiesel: ULSD\nGallons: 100\nTotal $398.00\nCard: XXXX1234',{id:'fuel'});
  const result=read([generic(),unloading(),fuel]);
  assert.equal(result.documents[0].kind,'unknown');
  assert.equal(result.pageIdentities[0].status,'conflicting');
});

test('a matching pair cannot overrule a third observation with another receipt number',()=>{
  for(const confidence of [.96,.3]){
    const other=unloading();other.id='third-read';
    other.lines[0].text='RECEIPT # RC-99';other.lines[0].confidence=confidence;
    const result=read([generic(),unloading(),other]);
    assert.equal(result.pageIdentities[0].status,'conflicting');
    assert.equal(result.documents[0].kind,'unknown');
    assert.equal(result.documents[0].reference,null);
  }
});

test('classification refinement preserves conflicting monetary reads for review',()=>{
  const other=unloading();other.lines.find(line=>line.text.startsWith('NET TOTAL')).text='NET TOTAL $498.00';
  const doc=read([generic(),other]).documents[0];
  assert.equal(doc.kind,'unloading_receipt');
  assert.equal(doc.fields.total.value,null);
  assert.ok(doc.fields.total.issues.includes('conflicting_reads'));
});

test('receipt refinement never combines identities across different pages',()=>{
  const result=readDocument({documentId:'separate-receipts',pages:[
    {id:'p1',observations:[generic()]},{id:'p2',observations:[unloading()]}
  ]});
  assert.deepEqual(result.documents.map(doc=>doc.kind),['other_expense','unloading_receipt']);
});
