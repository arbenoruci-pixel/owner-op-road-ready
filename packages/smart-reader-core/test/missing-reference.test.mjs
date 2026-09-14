import test from 'node:test';
import assert from 'node:assert/strict';
import {planBolIdentifierRegion} from '../src/ocrRetry.js';
import {readDocument,textObservation,resolveEvidence} from '../src/index.js';

const size={width:1800,height:2300};
const word=(text,left,top=270,width=text.length*9)=>({text,left,top,width,height:18});
const label=[word('B/L',1420),word('NO.',1456)];

test('an explicit empty B/L number field triggers a bounded source reread',()=>{
  const region=planBolIdentifierRegion(label,size);
  assert.ok(region);assert.ok(region.left<=1420);assert.ok(region.left+region.width>=1730,'include the missing value area');
  assert.ok(region.top<=270&&region.top+region.height>=288);
  assert.ok(region.height<60&&region.width*region.height<size.width*size.height*.06);
  assert.ok(region.left+region.width<=size.width);
  const fragment=planBolIdentifierRegion([...label,word('00123',1520)],size);
  assert.ok(fragment.left+fragment.width>=1730,'a partial number must not crop away its unread tail');
  assert.equal(planBolIdentifierRegion([word('B/L',1420)],size),null);
  assert.equal(planBolIdentifierRegion([word('BAL',1420),word('NO.',1456)],size),null);
  assert.equal(planBolIdentifierRegion(label,null),null);
  assert.equal(planBolIdentifierRegion(label,{width:NaN,height:2300}),null);
});

test('empty B/L proposals respect qualifiers, adjacent fields and image limits',()=>{
  for(const qualifier of ['Previous','Prior','Old','Attach','Copy','Reference','Revised'])
    assert.equal(planBolIdentifierRegion([word(qualifier,1290),...label],size),null,qualifier);
  assert.equal(planBolIdentifierRegion(label.map(w=>({...w,top:1700})),size),null);
  assert.equal(planBolIdentifierRegion(label.map(w=>({...w,left:1900})),size),null);
  const bounded=planBolIdentifierRegion([...label,word('DATE:',1700)],size);
  assert.ok(bounded.left+bounded.width<=1710,'adjacent field limits the reread');
  const unrelated=planBolIdentifierRegion([word('B/L',1420),word('NO.',1600)],size);
  assert.equal(unrelated,null,'a distant NO label is not enough');
});

test('parenthetical contract fragments cannot conflict with source-backed shipping parties',()=>{
  for(const opening of ['(','{','['])for(const delimiter of [' ',': ','# ',' : ']){
    const observation=textObservation('BILL OF LADING\nBOL NO: B-17\nSHIP FROM: Example Foods\nSHIP TO: Example Market\nShipper'+delimiter+opening+'or where\nCarrier'+delimiter+opening+'and when\n| Carrier Name'+delimiter+opening+'or when');
    const result=readDocument({documentId:'contract-fragment',pages:[{observations:[observation]}]});
    const field=result.documents[0].fields.shipper;
    assert.equal(field.candidates.length,1);assert.equal(field.candidates[0].value,'Example Foods');
    assert.ok(!field.issues.includes('conflicting_reads'));resolveEvidence(result,field.candidates[0].evidence[0]);
    assert.equal(result.documents[0].fields.carrier.candidates.length,0);
  }
  const result=readDocument({documentId:'party-names',pages:[{observations:[textObservation('BILL OF LADING\nSHIPPER: (Example Foods)\nSHIP TO: Example Market')]}]});
  assert.equal(result.documents[0].fields.shipper.candidates[0].value,'(Example Foods)');
});
