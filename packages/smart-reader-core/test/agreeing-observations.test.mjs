import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation} from '../src/index.js';
import {hasReadableBolReference,needsAmountSourceVerification} from '../src/ocrRetry.js';

const observation=(id,text,confidence=.96)=>({...textObservation(text,{id}),lines:text.split('\n').map(text=>({text,confidence}))});
const bol='BILL OF LADING\nSHIP FROM: Example Foods\nSHIP TO: Example Market\nBOL No: EX-349\nPO No: ORDER-42';
const receipt='RECEIPT # R-349\nLOAD DETAILS\nLOAD DESCRIPTION: UNLOADING\nRELAY PAYMENT DETAILS\nCarrier: Example Transport\nAmount $240.00\nCheckout Fee $7.00\nNET TOTAL $247.00';
const read=observations=>readDocument({documentId:'agreeing-reads',pages:[{id:'page-1',observations}]});
const layout=(value='Example Transport',confidence=.96)=>({id:'layout',sourceImageId:'layout-image',lines:[
  {text:'Carrier:',confidence:.96,box:{x:.06,y:.3,width:.1,height:.02}},
  {text:value,confidence,box:{x:.22,y:.3,width:.23,height:.02}},
]});

test('an agreeing layout or weak retry preserves strong direct support, in any order',()=>{
  for(const observations of [[observation('direct',receipt),layout()], [layout(),observation('direct',receipt)], [observation('weak',receipt,.6),observation('direct',receipt)], [observation('direct',receipt),observation('weak',receipt,.6)]]){
    const before=structuredClone(observations),result=read(observations),carrier=result.documents[0].fields.carrier;
    assert.equal(carrier.value,'Example Transport');assert.equal(carrier.status,'supported');assert.deepEqual(carrier.issues,[]);
    assert.equal(carrier.candidates[0].evidence.length,2);
    for(const evidence of carrier.candidates[0].evidence)resolveEvidence(result,evidence);
    assert.deepEqual(observations,before);
  }
  const field=read([observation('direct',receipt),layout()]).documents[0].fields.carrier;
  assert.equal(field.candidates[0].evidence[1].matchIssue,'layout_needs_review','weaker evidence keeps its own qualification');
});

test('a strong layout proposal cannot launder a weak inline read into support',()=>{
  const field=read([observation('weak',receipt,.6),layout()]).documents[0].fields.carrier;
  assert.equal(field.value,null);assert.ok(field.issues.includes('weak_recognition'));assert.ok(field.issues.includes('layout_needs_review'));
  const onlyLayout=read([observation('heading',receipt.replace('Carrier: Example Transport\n','')),layout()]).documents[0].fields.carrier;
  assert.equal(onlyLayout.value,null);assert.ok(onlyLayout.issues.includes('layout_needs_review'));
});

test('different values remain conflicting even when one is weaker or a layout proposal',()=>{
  for(const retry of [observation('weak',receipt.replace('Example Transport','Other Carrier'),.6),layout('Other Carrier')]){
    const field=read([observation('direct',receipt),retry]).documents[0].fields.carrier;
    assert.equal(field.value,null);assert.ok(field.issues.includes('conflicting_reads'));assert.equal(field.candidates.length,2);
  }
});

test('equivalent numeric formatting and weaker agreeing BOL/PO reads retain direct support',()=>{
  const money=read([observation('direct',receipt),observation('weak',receipt.replace('$240.00','240'),.5)]).documents[0];
  assert.equal(money.fields.amount.value,'240.00');assert.equal(money.checks[0].status,'passed');
  const fields=read([observation('weak',bol,.65),observation('direct',bol)]).documents[0].fields;
  assert.equal(fields.bolNumber.value,'EX-349');assert.equal(fields.poNumber.value,'ORDER-42');
  assert.equal(hasReadableBolReference([{text:bol,confidence:.65},{text:bol,confidence:.96}]),true);
  assert.equal(hasReadableBolReference([{text:bol.replace('EX-349','EX-340'),confidence:.65},{text:bol,confidence:.96}]),false);
});

test('raw financial verification retains competing totals and never computes a replacement',()=>{
  const damaged=receipt.replace('$247.00','$147.00');
  assert.equal(needsAmountSourceVerification([{text:damaged,confidence:.99}]),true);
  assert.equal(needsAmountSourceVerification([{text:receipt,confidence:.99}]),true,'even apparently consistent cleanup must be checked against source pixels');
  assert.equal(needsAmountSourceVerification([{text:bol,confidence:.99}]),false);
  const onlyDamaged=read([observation('clean',damaged)]).documents[0];
  assert.equal(onlyDamaged.fields.total.value,null);assert.equal(onlyDamaged.checks[0].status,'needs_review');
  const verified=read([observation('clean',damaged),observation('original',receipt)]).documents[0];
  assert.equal(verified.fields.amount.value,'240.00');assert.equal(verified.fields.fee.value,'7.00');
  assert.equal(verified.fields.total.value,null);assert.ok(verified.fields.total.issues.includes('conflicting_reads'));
  assert.deepEqual(verified.fields.total.candidates.map(c=>c.value),['147.00','247.00']);
  assert.equal(verified.checks[0].status,'not_checked','arithmetic cannot choose between actual OCR alternatives');
});
