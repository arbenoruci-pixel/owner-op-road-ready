import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation} from '../src/index.js';

const bol='BILL OF LADING - NOT NEGOTIABLE\nBill of Lading Number: B-1234\nSHIP FROM: EXAMPLE MILL\nSHIP TO: EXAMPLE MARKET\nWeight: 1200 LB';
const fuel='RECEIPT\nReceipt # R-1234\nDate: 2026-09-21\nDEF\nPump: 12\nPrice/Gal: 3.999\nSubtotal: $39.99\nTotal: $39.99\nPayment: CARD';
const read=(...texts)=>readDocument({documentId:'classification',pages:[{id:'p1',observations:texts.map((text,i)=>textObservation(text,{id:'read-'+i}))}]});

test('filled receiver acknowledgement makes a BOL a POD without requiring a delivery date',()=>{
  for(const suffix of ['Received by: J. DOE','Received by J. DOE','Receiver Signature: J. DOE',"Consignee's Signature: José O’Neill",'DELIVERY ACCEPTANCE\nSigned by: J. DOE']){
    const result=read(bol+'\n'+suffix);
    assert.equal(result.pageIdentities[0].kind,'pod',suffix);
    assert.equal(result.pageIdentities[0].status,'supported');
    assert.equal(result.documents[0].canAutoFile,false);
    for(const vote of result.pageIdentities[0].evidence)for(const evidence of [vote.evidence,...vote.supportingEvidence])resolveEvidence(result,evidence);
  }
});

test('blank fields, pickup signatures and instructions cannot establish delivery',()=>{
  for(const suffix of ['Received by:','Received by: _____','Received by: N/A','Received by: Print Name','Receiver Signature: ______',
    'Driver Signature: J. DOE','Shipper Signature: J. DOE','PICKUP ACKNOWLEDGEMENT\nReceived by: J. DOE','Signed by: J. DOE\nDelivery Date: 2026-09-21',
    'DELIVERY ACCEPTANCE\nDRIVER SIGNATURE\nSigned by: J. DOE','Driver must obtain Received by signature at delivery.']){
    assert.equal(read(bol+'\n'+suffix).pageIdentities[0].kind,'bol',suffix);
  }
});

test('BOL form variants share the delivery refinement',()=>{
  for(const heading of ['UNIFORM STRAIGHT BILL OF LADING','ALTERNATE BILL OF LADING','STRAIGHT BILL OF LADING']){
    assert.equal(read(bol.replace('BILL OF LADING - NOT NEGOTIABLE',heading)+'\nReceived by: J. DOE').pageIdentities[0].kind,'pod');
  }
});

test('matching BOL references reconcile completed and incomplete reads in either order',()=>{
  for(const texts of [[bol,bol+'\nReceived by: J. DOE'],[bol+'\nReceived by: J. DOE',bol]]){
    assert.equal(read(...texts).pageIdentities[0].kind,'pod');
  }
  assert.equal(read(bol,bol.replace('B-1234','B-9999')+'\nReceived by: J. DOE').pageIdentities[0].status,'conflicting');
});

test('fuel dispensing evidence refines generic receipts and aliases',()=>{
  for(const text of [fuel,fuel.replace('DEF','DIESEL'),fuel.replace('DEF','ULSD'),fuel.replace('Pump: 12','Gallons: 10'),fuel.replace('Price/Gal: 3.999','Gallons: 10')]){
    const result=read(text);
    assert.equal(result.pageIdentities[0].kind,'fuel_receipt');
    assert.equal(result.pageIdentities[0].status,'supported');
    assert.equal(result.documents[0].fields.total.value,'39.99');
    for(const vote of result.pageIdentities[0].evidence)for(const evidence of [vote.evidence,...vote.supportingEvidence])resolveEvidence(result,evidence);
  }
});

test('incidental diesel or pump wording stays out of firm fuel classification',()=>{
  for(const text of ['RECEIPT\nDate: 2026-09-21\nDiesel pump repair\nTotal: $100.00','RECEIPT\nDate: 2026-09-21\nDEF bottle\nTotal: $15.00',
    'SERVICE INVOICE\nLabor: diesel pump repair\nParts: PUMP-1234\nTotal: $400.00']){
    assert.notEqual(read(text).pageIdentities[0].kind,'fuel_receipt');
  }
});

test('fuel and generic OCR reads require one matching receipt reference',()=>{
  const generic=fuel.replace('DEF\nPump: 12\nPrice/Gal: 3.999\n','');
  assert.equal(read(generic,fuel).pageIdentities[0].kind,'fuel_receipt');
  assert.equal(read(fuel,generic).pageIdentities[0].kind,'fuel_receipt');
  assert.equal(read(generic.replace('R-1234','R-9999'),fuel).pageIdentities[0].status,'conflicting');
});

test('weak delivery and fuel reads retain their type with review required',()=>{
  for(const [kind,text] of [['pod',bol+'\nReceived by: J. DOE'],['fuel_receipt',fuel]]){
    const observation=textObservation(text);observation.lines.forEach(line=>line.confidence=.5);
    const result=readDocument({documentId:'weak',pages:[{observations:[observation]}]});
    assert.equal(result.pageIdentities[0].kind,kind);assert.equal(result.pageIdentities[0].status,'needs_review');
  }
});

test('distinct documents on one page remain conflicting',()=>{
  assert.equal(read(bol+'\nReceived by: J. DOE\n'+fuel).pageIdentities[0].status,'conflicting');
});
