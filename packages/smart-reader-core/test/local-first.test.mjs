import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation} from '../src/index.js';
import {clippedBol,clippedPod,soldToPacking,viaPacking} from './local-first-fixture.mjs';
const read=(...texts)=>readDocument({documentId:'local-forms',pages:[{id:'p1',observations:texts.map((text,i)=>textObservation(text,{id:'read-'+i}))}]});

test('clipped known BOL modifiers and a wrapped short-form title retain exact delivery evidence',()=>{
  for(const title of ['RNATE STRAIGHT BILL OF LADING -\nSHORT FORM','NATE STRAIGHT BILL OF LADING - SHORT FORM','IFORM STRAIGHT BILL OF LADING','ALTERNATE STRAIGHT BILL OF LADING —']){
    const text=clippedPod.replace('RNATE STRAIGHT BILL OF LADING -\nSHORT FORM',title),result=read(text);
    assert.equal(result.pageIdentities[0].kind,'pod',title);
    assert.equal(result.pageIdentities[0].status,'needs_review');assert.equal(result.documents[0].canAutoFile,false);
    assert.equal(result.documents[0].fields.poNumber.value,'PO-2401');
    for(const vote of result.pageIdentities[0].evidence)for(const e of [vote.evidence,...vote.supportingEvidence]){
      assert.equal(resolveEvidence(result,e).line.text,e.quote);assert.ok(text.includes(e.quote));
    }
  }
});

test('clipped titles retain blank and pickup-signature distinctions',()=>{
  for(const text of [clippedBol,clippedPod.replace('SIGNATURE J. DOE','SIGNATURE ____'),clippedPod.replace('SIGNATURE J. DOE','Driver Signature: J. DOE'),clippedPod.replace('RECEIVED\n','RECEIVED\nPICKUP ACKNOWLEDGEMENT\n')]){
    assert.equal(read(text).pageIdentities[0].kind,'bol');
  }
});

test('arbitrary, negative and instructional prefixes cannot masquerade as clipped BOL modifiers',()=>{
  for(const prefix of ['No','NOT','Attach','Please attach','See','Send','NOTALTERNATE','UNAUTHORIZED','ZZZZ']){
    assert.equal(read(clippedPod.replace('RNATE',prefix)).pageIdentities[0].kind,'unknown',prefix);
  }
  for(const missing of ['Shipper: EXAMPLE DISTRIBUTION','Ship To:\nConsignes: REGIONAL FOODS']){
    assert.equal(read(clippedBol.replace(missing,'')).pageIdentities[0].kind,'unknown');
  }
});

test('sold-to and ship-via packing forms identify the type independently of extraction completeness',()=>{
  for(const text of [soldToPacking,viaPacking,viaPacking.replace('Ship Via:','| Ship Via:').replace('\nItem','\n[Item')]){
    const result=read(text),doc=result.documents[0];
    assert.equal(doc.kind,'packing_list');assert.equal(doc.identityStatus,'supported');
    assert.equal(doc.fields.packingSlipNumber.value,null);assert.equal(doc.canAutoFile,false);
    for(const vote of result.pageIdentities[0].evidence)for(const e of [vote.evidence,...vote.supportingEvidence])resolveEvidence(result,e);
  }
});

test('a damaged or low-confidence packing title stays reviewable',()=>{
  for(const title of ['Packing Sip','Packing Llst','PackingSlip']){
    const result=read(soldToPacking.replace('Packing Slip',title));
    assert.equal(result.pageIdentities[0].kind,'packing_list');assert.equal(result.pageIdentities[0].status,'needs_review');
  }
  const observation=textObservation(soldToPacking);observation.lines[0].confidence=.5;
  const result=readDocument({documentId:'weak-title',pages:[{observations:[observation]}]});
  assert.equal(result.pageIdentities[0].status,'needs_review');
});

test('packing instructions and repeated titles never replace independent form structure',()=>{
  for(const text of ['Please attach a Packing Slip\nSold To: EXAMPLE\nOrdered','No Packing Slip\nSold To: EXAMPLE\nOrdered',
    'Packing Slip\nSold To: EXAMPLE','Packing Slip\nOrdered','Packing Slip Number: 12345\nPacking Slip Number: 12345\nSold To: EXAMPLE']){
    assert.equal(read(text).pageIdentities[0].kind,'unknown',text);
  }
  const result=readDocument({documentId:'separate-forms',pages:[{observations:[textObservation('Packing Slip\nSold To: EXAMPLE')]},{observations:[textObservation('Ordered\nShipped')]}]});
  assert.ok(result.pageIdentities.every(p=>p.kind==='unknown'));
});

test('local type recovery preserves conflicting identifiers and mixed-document review',()=>{
  const result=read(soldToPacking+'\nCustomer PO: PO-2401',soldToPacking+'\nCustomer PO: PO-2407');
  assert.equal(result.pageIdentities[0].kind,'packing_list');
  assert.equal(result.documents[0].fields.poNumber.value,null);assert.ok(result.documents[0].fields.poNumber.issues.includes('conflicting_reads'));
  const mixed=read(clippedPod+'\n'+soldToPacking);
  assert.equal(mixed.pageIdentities[0].status,'conflicting');assert.equal(mixed.documents[0].canAutoFile,false);
});
