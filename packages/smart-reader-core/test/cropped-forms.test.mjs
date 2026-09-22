import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation} from '../src/index.js';
import {croppedBolObservation,croppedPackingObservation} from './cropped-forms-fixture.mjs';
const read=(...observations)=>readDocument({documentId:'cropped-forms',pages:[{id:'p1',observations}]});

test('left-edge BOL labels recover a reviewable type without repairing fields or source text',()=>{
  const input=croppedBolObservation(),snapshot=structuredClone(input),result=read(input);
  assert.equal(result.pageIdentities[0].kind,'bol');assert.equal(result.pageIdentities[0].status,'needs_review');
  assert.equal(result.documents[0].fields.carrier.value,null);assert.equal(result.documents[0].fields.shipper.value,null);
  assert.equal(result.documents[0].fields.bolNumber.value,null);assert.equal(result.documents[0].canAutoFile,false);
  const evidence=result.pageIdentities[0].evidence.flatMap(v=>[v.evidence,...v.supportingEvidence]);
  assert.ok(evidence.some(e=>e.quote==='ROM:'));assert.ok(evidence.some(e=>e.quote==='ARRIER:'));
  evidence.forEach(e=>assert.equal(resolveEvidence(result,e).line.text,e.quote));assert.deepEqual(input,snapshot);
});

test('partial shipping words outside the crop edge and absent form signals cannot classify a BOL',()=>{
  for(const change of [
    o=>{o.lines.find(l=>l.id==='from').box.x=.2;},
    o=>{o.lines.find(l=>l.id==='carrier').box.y=.6;},
    o=>{delete o.lines.find(l=>l.id==='from').box;},
    o=>{o.lines.find(l=>l.id==='from').text='ROM module';},
    o=>{o.lines.find(l=>l.id==='carrier').text='BARRIER:';},
    ...['from','carrier','consigned','weight','terms'].map(id=>o=>{o.lines=o.lines.filter(l=>l.id!==id);}),
  ]){const input=croppedBolObservation();change(input);assert.equal(read(input).pageIdentities[0].kind,'unknown',change.toString());}
});

test('a clipped BOL cannot borrow structure from a different OCR observation',()=>{
  const a=croppedBolObservation(),b=croppedBolObservation();b.id='second';b.sourceImageId='second-image';
  a.lines=a.lines.filter(l=>l.id!=='consigned');b.lines=b.lines.filter(l=>l.id!=='carrier');
  assert.equal(read(a,b).pageIdentities[0].kind,'unknown');
});

test('complete packing-form columns identify a cropped page and preserve exact numbered references',()=>{
  const input=croppedPackingObservation(),snapshot=structuredClone(input),second=croppedPackingObservation();second.id='second-read';
  assert.equal(read(input).documents[0].fields.packingSlipNumber.status,'needs_review');
  const result=read(input,second),doc=result.documents[0];
  assert.equal(doc.kind,'packing_list');assert.equal(doc.identityStatus,'supported');
  assert.equal(doc.fields.packingSlipNumber.value,'PS-2401');assert.equal(doc.fields.orderNumber.value,'SO-2701');
  assert.equal(doc.fields.consignee.value,null);assert.equal(doc.canAutoFile,false);
  for(const vote of result.pageIdentities[0].evidence)for(const e of [vote.evidence,...vote.supportingEvidence])resolveEvidence(result,e);
  assert.deepEqual(input,snapshot);
});

test('packing references, instructions and incomplete or weak tables cannot substitute for a whole form',()=>{
  for(const id of ['title','number','order','ship-date','description','ordered','shipped']){
    const input=croppedPackingObservation();input.lines=input.lines.filter(l=>l.id!==id);
    assert.equal(read(input).pageIdentities[0].kind,'unknown',id);
  }
  for(const title of ['Please attach Packing Slip','No Packing Slip','Packing Slip Number: PS-2401']){
    const input=croppedPackingObservation();input.lines.find(l=>l.id==='title').text=title;
    assert.equal(read(input).pageIdentities[0].kind,'unknown',title);
  }
  const weak=croppedPackingObservation();weak.lines.find(l=>l.id==='shipped').confidence=.3;
  assert.equal(read(weak).pageIdentities[0].kind,'unknown');
});

test('new packing structure stays within its own observation and page',()=>{
  const a=croppedPackingObservation(),b=croppedPackingObservation();b.id='second';
  a.lines=a.lines.filter(l=>l.id!=='shipped');b.lines=b.lines.filter(l=>l.id!=='ordered');
  assert.equal(read(a,b).pageIdentities[0].kind,'unknown');
  const result=readDocument({documentId:'separate',pages:[{observations:[a]},{observations:[b]}]});
  assert.ok(result.pageIdentities.every(p=>p.kind==='unknown'));
});

test('cropped packing recovery keeps conflicting references and mixed documents unresolved',()=>{
  const a=croppedPackingObservation(),b=croppedPackingObservation();b.id='second';b.lines.find(l=>l.id==='number-value').text='PS-2407';
  const result=read(a,b);assert.equal(result.pageIdentities[0].kind,'packing_list');
  assert.equal(result.documents[0].fields.packingSlipNumber.value,null);
  assert.ok(result.documents[0].fields.packingSlipNumber.issues.includes('conflicting_reads'));
  const mixed=read(a,textObservation('FUEL RECEIPT\nDiesel\nGallons: 50\nTotal: $200\nCard: VISA',{id:'fuel'}));
  assert.equal(mixed.pageIdentities[0].status,'conflicting');assert.equal(mixed.documents[0].canAutoFile,false);
});
