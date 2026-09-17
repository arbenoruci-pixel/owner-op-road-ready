import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation,confirmField} from '../src/index.js';
import {rateInput,rateText} from './rate-confirmation-fixture.mjs';

test('rate confirmation uses a heading and stops, keeping the carrier total separate from fees',()=>{
  const input=rateInput(),before=JSON.stringify(input),result=readDocument(input),doc=result.documents[0];
  assert.equal(doc.kind,'rate_confirmation');
  assert.equal(doc.reference,'86420');
  assert.equal(doc.fields.totalRate.value,'2300.00');
  assert.equal(doc.fields.equipment.value,'POWER ONLY');
  assert.equal(doc.fields.miles.value,'987');
  assert.equal(doc.fields.weight.value,null,'a weight without units remains uncertain');
  assert.equal(doc.fields.pickupAddress.candidates[0].value,'123 EXAMPLE RD, ALBANY NY 12207');
  assert.equal(doc.fields.deliveryAddress.candidates[0].value,'456 SAMPLE ST, MADISON WI 53703');
  assert.equal(doc.fields.pickupAppointment.candidates[0].value,'09/16/26 08:00 to 09/16/26 16:00');
  assert.equal(doc.fields.deliveryAppointment.candidates[0].value,'09/22/26 08:00 to 09/22/26 16:00');
  for(const key of ['pickupAddress','deliveryAddress','pickupAppointment','deliveryAppointment']){
    assert.equal(doc.fields[key].status,'needs_review','section context must be confirmed');
    assert.equal(doc.fields[key].value,null);
  }
  for(const field of Object.values(doc.fields))for(const candidate of field.candidates)
    for(const evidence of [...candidate.evidence,...(candidate.labelEvidence||[]),...(candidate.continuationEvidence||[])])resolveEvidence(result,evidence);
  assert.equal(doc.canAutoFile,false);
  assert.equal(result.calibration.automaticAcceptance,false);
  assert.equal(JSON.stringify(input),before);
});

test('signature and certificate pages remain accounted for without inventing load references',()=>{
  const input=rateInput();
  input.pages.push({id:'page-2',observations:[textObservation('SIGNATURE PAGE\nDocument Ref: SYNTHETIC-REFERENCE Page 2 of 2')]},
    {id:'page-3',observations:[textObservation('REF. NUMBER DOCUMENT COMPLETED BY ALL PARTIES ON\nSYNTHETIC-REFERENCE 16 SEP 2026 22:20:45\nSIGNER TIMESTAMP SIGNATURE\nSIGNED\nSigned with PandaDoc')]});
  const result=readDocument(input);
  assert.deepEqual(result.documents.map(d=>d.kind),['rate_confirmation','signature_page','signing_certificate']);
  assert.deepEqual(result.documents.flatMap(d=>d.pageIds),['page-1','page-2','page-3']);
  assert.ok(result.documents.slice(1).every(d=>d.role==='supporting'));
  assert.equal(result.documents[1].reference,'SYNTHETIC-REFERENCE','a document reference never becomes a load number');
});

test('mentions, missing headings and incomplete stop structures cannot establish a RateCon',()=>{
  for(const text of [
    rateText.replace('PRO # 86420 Rate Confirmation','Please attach Rate Confirmation'),
    rateText.replace('PRO # 86420 Rate Confirmation','NOT A RATE CONFIRMATION'),
    rateText.replace('PRO # 86420 Rate Confirmation','PRO # 86420'),
    rateText.replace('TOTAL RATE 2300.00','LATE FEE 150.00'),
    rateText.replace('STOP 1','UNKNOWN SECTION'),
    rateText.replace('PICK 1\nPICK UP','UNKNOWN SECTION'),
  ])assert.equal(readDocument(rateInput(text)).documents[0].kind,'unknown');
});

test('genuine amount and identifier conflicts survive rereading',()=>{
  const input=rateInput();
  input.pages[0].observations.push(textObservation(rateText.replaceAll('86420','86429').replaceAll('2300.00','2800.00'),{id:'retry'}));
  const doc=readDocument(input).documents[0];
  for(const key of ['loadNumber','totalRate']){
    assert.equal(doc.fields[key].value,null);
    assert.ok(doc.fields[key].issues.includes('conflicting_reads'));
  }
  assert.equal(doc.reference,null);
});

test('weak OCR cannot auto-support a RateCon total or reference',()=>{
  const input=rateInput();
  input.pages[0].observations[0].lines.forEach(line=>line.confidence=.6);
  const doc=readDocument(input).documents[0];
  for(const key of ['loadNumber','totalRate']){
    assert.equal(doc.fields[key].value,null);
    assert.ok(doc.fields[key].issues.includes('weak_recognition'));
  }
});

test('multiple generic stops are not silently collapsed into one delivery',()=>{
  const text=rateText+'\nSTOP 2\n789 THIRD AVE Appointment 09/23/26 09:00\nCHICAGO IL 60601';
  const fields=readDocument(rateInput(text)).documents[0].fields;
  assert.equal(fields.deliveryAddress.status,'missing');
  assert.equal(fields.deliveryAppointment.status,'missing');
});

test('dates from signing and payment prose are excluded from appointments',()=>{
  const text=rateText.replaceAll(/Appointment[^\n]*/g,'')+'\nSIGNED 16 SEP 2026 22:20:45\nPayment terms NET30';
  const fields=readDocument(rateInput(text)).documents[0].fields;
  assert.equal(fields.pickupAppointment.status,'missing');
  assert.equal(fields.deliveryAppointment.status,'missing');
});

test('a second RateCon with the same PRO stays separate for review',()=>{
  const input=rateInput();
  input.pages.push({id:'page-2',observations:[textObservation(rateText.replaceAll('2300.00','2800.00'))]});
  const result=readDocument(input);
  assert.equal(result.documents.length,2);
  assert.deepEqual(result.documents.map(d=>d.fields.totalRate.value),['2300.00','2800.00']);
});

test('source review confirms a RateCon field and preserves the original evidence',()=>{
  const result=readDocument(rateInput()),doc=result.documents[0],field=doc.fields.pickupAddress,candidate=field.candidates[0];
  const next=confirmField(result,{documentId:result.documentId,groupId:doc.id,field:'pickupAddress',rawValue:candidate.value,
    evidence:candidate.evidence[0],userConfirmed:true,expectedRevision:0,expectedRawValues:field.candidates.map(c=>c.rawValue)});
  assert.equal(next.documents[0].fields.pickupAddress.status,'confirmed');
  assert.equal(next.documents[0].fields.pickupAddress.value,'123 EXAMPLE RD, ALBANY NY 12207');
  assert.equal(next.corrections[0].sourceQuote,'123 EXAMPLE RD');
  assert.equal(next.corrections[0].trainingEligible,false);
  assert.equal(next.documents[0].canAutoFile,false);
  assert.equal(result.reviewRevision,0);
});

test('common carrier RateCon headings and labeled party/date layouts use the same profile',()=>{
  for(const heading of ['CARRIER RATE CONFIRMATION','RATE CONFIRMATION FOR PO# 42001','LOAD CONFIRMATION']){
    const result=readDocument(rateInput(heading+'\nLoad # 42001\nBroker: Example Brokerage\nCarrier: Example Transport\nShipper: Example Mill\nConsignee: Example Market\nPickup Date: 2026-09-17\nDelivery Date: 2026-09-18\nTotal Carrier Pay $2400.00'));
    assert.equal(result.documents[0].kind,'rate_confirmation');
    assert.equal(result.documents[0].fields.totalRate.value,'2400.00');
    assert.equal(result.documents[0].fields.broker.value,'Example Brokerage');
    assert.equal(result.documents[0].fields.deliveryDate.value,'2026-09-18');
  }
});
