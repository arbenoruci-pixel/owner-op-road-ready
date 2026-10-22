import test from 'node:test';
import assert from 'node:assert/strict';
import {decideDocumentIdentity} from '../../source/src/modules/scan/documentIdentityV110334.js';

test('unqualified BOL and POD guesses require source review instead of surviving as the filing type',()=>{
  for(const id of ['bol','pod']){
    const result=decideDocumentIdentity({type:{id},text:'Unrecognized contract\nCarrier Example\nTotal: $4000',confidence:.9});
    assert.equal(result.typeId,'other');assert.equal(result.requiresTypeReview,true);
    const manual=decideDocumentIdentity({type:{id},text:'Unrecognized contract',userSelectedTypeV11036:true,confidence:.9});
    assert.equal(manual.typeId,id);
  }
});

test('actual BOL structure and explicit shipping identifiers retain the BOL classification',()=>{
  const result=decideDocumentIdentity({type:{id:'bol'},text:'BILL OF LADING\nBOL Number: 12345678\nShipper: EXAMPLE MILL\nConsignee: EXAMPLE MARKET\nCarrier: EXAMPLE CARRIER\nWeight: 1000 LB',confidence:.9});
  assert.equal(result.typeId,'bol');assert.equal(result.requiresTypeReview,false);
});
