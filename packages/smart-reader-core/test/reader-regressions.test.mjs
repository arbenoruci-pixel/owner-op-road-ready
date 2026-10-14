import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation} from '../src/index.js';
import {damagedShortBol,rateWithBolTerms,signedCarrierAgreement} from './reader-regression-fixture.mjs';

const read=(...texts)=>readDocument({documentId:'sanitized-regression',pages:[{id:'source-page',observations:texts.map((text,i)=>textObservation(text,{id:'source-'+i}))}]});
const proof=result=>{
  for(const vote of result.pageIdentities[0].evidence)for(const e of [vote.evidence,...vote.supportingEvidence])resolveEvidence(result,e);
  for(const doc of result.documents)for(const field of Object.values(doc.fields))for(const candidate of field.candidates)
    for(const e of [...candidate.evidence,...(candidate.labelEvidence||[]),...(candidate.continuationEvidence||[])])resolveEvidence(result,e);
};

test('sanitized short-form OCR recovers BOL identity with exact damaged heading evidence',()=>{
  const result=read(damagedShortBol),doc=result.documents[0];
  assert.equal(doc.kind,'bol');assert.equal(doc.identityStatus,'needs_review');
  assert.equal(doc.fields.bolNumber.value,'SYN-BOL-0042');
  assert.equal(doc.fields.shipper.value,'Synthetic Mill LLC');assert.equal(doc.fields.consignee.value,'Synthetic Market Inc');
  assert.equal(doc.fields.carrier.value,'Synthetic Transport LLC');
  // A BOL identifier must never be relabeled as its separate printed load ID.
  assert.equal(doc.reference,'SYN-BOL-0042');assert.equal(doc.fields.loadNumber,undefined);
  assert.equal(doc.fields.documentDate.value,null);assert.ok(doc.fields.documentDate.issues.includes('ambiguous_date'));
  assert.equal(doc.fields.pickupAddress,undefined);assert.equal(doc.fields.deliveryAddress,undefined);
  const quotes=result.pageIdentities[0].evidence.flatMap(v=>[v.evidence,...v.supportingEvidence]).map(e=>e.quote);
  for(const raw of ['BILL OF LADIN','G-SHORT FORM','ORIGINAL-NOT NEGOTIABLE','FROM SHIPPER: Synthetic Mill LLC'])assert.ok(quotes.includes(raw),raw);
  assert.equal(doc.canAutoFile,false);proof(result);
});

test('bounded damaged BOL title variants do not alter source or identifier digits',()=>{
  for(const heading of ['BILL OF LADIN','STRAIGHT BILL OF LADIN G-SHORT FORM','UNIFORM STRAIGHT BILL OF LADIN G-SHORT FORM']){
    const text=damagedShortBol.replace('BILL OF LADIN\nG-SHORT FORM',heading),result=read(text);
    assert.equal(result.documents[0].kind,'bol',heading);assert.equal(result.documents[0].identityStatus,'needs_review');
    assert.equal(result.pages[0].observations[0].lines[0].text,heading);proof(result);
  }
});

test('intact BOL headings also accept combined printed party labels without repair',()=>{
  for(const heading of ['BILL OF LADING','STRAIGHT BILL OF LADING - SHORT FORM']){
    const result=read(damagedShortBol.replace('BILL OF LADIN\nG-SHORT FORM',heading)),doc=result.documents[0];
    assert.equal(doc.kind,'bol');assert.equal(doc.identityStatus,'supported');
    assert.equal(doc.fields.shipper.value,'Synthetic Mill LLC');assert.equal(doc.fields.consignee.value,'Synthetic Market Inc');proof(result);
  }
});

test('empty combined BOL role labels are not company names',()=>{
  const result=read(damagedShortBol.replace('FROM SHIPPER: Synthetic Mill LLC','FROM SHIPPER').replace('TO CONSIGNEE: Synthetic Market Inc','TO CONSIGNEE'));
  assert.equal(result.documents[0].kind,'bol');
  for(const key of ['shipper','consignee']){
    assert.equal(result.documents[0].fields[key].value,null);assert.equal(result.documents[0].fields[key].status,'missing');
  }
});

test('BOL mentions in rate terms remain rate confirmation evidence, not competing headings',()=>{
  const result=read(rateWithBolTerms),doc=result.documents[0];
  assert.equal(doc.kind,'rate_confirmation');assert.equal(doc.fields.loadNumber.value,'SYN-LOAD-9001');
  assert.equal(doc.reference,'SYN-LOAD-9001');assert.equal(doc.fields.totalRate.value,'1800.00');
  assert.equal(doc.fields.pickupDate.value,null);assert.equal(doc.fields.deliveryDate.value,null);proof(result);
  // Do not implement this fix as a blanket RateCon override of real BOL proof.
  const mixed=read(rateWithBolTerms+'\n'+damagedShortBol);
  assert.equal(mixed.pageIdentities[0].status,'conflicting');assert.equal(mixed.documents[0].kind,'unknown');
});

test('damaged-title recovery requires form context from one observation and rejects prose',()=>{
  for(const heading of ['No BILL OF LADIN','Please attach BILL OF LADIN','BILL OF LADIN must be returned','BILL OF LADIN G-SHORT FORM instructions']){
    assert.equal(read(damagedShortBol.replace('BILL OF LADIN\nG-SHORT FORM',heading)).documents[0].kind,'unknown',heading);
  }
  for(const removed of ['FROM SHIPPER: Synthetic Mill LLC','TO CONSIGNEE: Synthetic Market Inc','ORIGINAL-NOT NEGOTIABLE']){
    assert.equal(read(damagedShortBol.replace(removed,'')).documents[0].kind,'unknown',removed);
  }
  const first=damagedShortBol.replace('TO CONSIGNEE: Synthetic Market Inc',''),second=damagedShortBol.replace('FROM SHIPPER: Synthetic Mill LLC','');
  assert.equal(read(first,second).documents[0].kind,'unknown');
  assert.equal(read('G-SHORT FORM\nORIGINAL-NOT NEGOTIABLE\nFROM SHIPPER: Synthetic Mill LLC\nTO CONSIGNEE: Synthetic Market Inc').documents[0].kind,'unknown');
});

test('signed agreement company fields remain scoped to explicit broker and carrier roles',()=>{
  const result=read(signedCarrierAgreement),doc=result.documents[0];
  assert.equal(doc.kind,'carrier_agreement');
  assert.equal(doc.fields.broker.value,'Synthetic Brokerage LLC');assert.equal(doc.fields.carrier.value,'Synthetic Transport LLC');
  for(const [key,role] of [['broker','BROKER'],['carrier','CARRIER']]){
    assert.equal(doc.fields[key].candidates.length,1);
    assert.ok(doc.fields[key].candidates[0].labelEvidence.some(e=>e.quote===role));
    assert.ok(!doc.fields[key].candidates[0].rawValue.includes('Signer'));
  }
  assert.equal(doc.fields.loadNumber,undefined);assert.equal(doc.canAutoFile,false);proof(result);
});

test('agreement roles do not arise from an unlabeled signer or leak across observations',()=>{
  const unsigned='BROKER CARRIER AGREEMENT\nBroker: _____\nCarrier: Synthetic Transport LLC\nSigned by: Synthetic Brokerage LLC';
  const doc=read(unsigned).documents[0];assert.equal(doc.kind,'carrier_agreement');assert.equal(doc.fields.broker.value,null);
  const result=read('BROKER CARRIER AGREEMENT\nBROKER\nCARRIER\nCompany Name: Synthetic Transport LLC','Company Name: Synthetic Brokerage LLC\nSigned by: Synthetic Broker Signer');
  assert.equal(result.documents[0].fields.broker.value,null);
  assert.equal(result.documents[0].fields.carrier.value,'Synthetic Transport LLC');proof(result);
});

test('conflicting agreement company reads remain unresolved with both exact sources',()=>{
  const result=read(signedCarrierAgreement,signedCarrierAgreement.replace('Synthetic Brokerage LLC','Alternate Synthetic Brokerage LLC'));
  assert.equal(result.documents[0].fields.broker.value,null);
  assert.ok(result.documents[0].fields.broker.issues.includes('conflicting_reads'));
  assert.equal(result.documents[0].fields.carrier.value,'Synthetic Transport LLC');proof(result);
});

test('agreement signature headings select companies, never the individual signer',()=>{
  const text=signedCarrierAgreement.replace('\nBROKER\n','\nBROKER SIGNATURE\n').replace('\nCARRIER\n','\nCARRIER SIGNATURE\n');
  const result=read(text),doc=result.documents[0];
  assert.equal(doc.fields.broker.value,'Synthetic Brokerage LLC');assert.equal(doc.fields.carrier.value,'Synthetic Transport LLC');proof(result);
  const prose=read('BROKER CARRIER AGREEMENT\nBroker shall provide records.\nCarrier shall perform services.\nSigned by: Synthetic Brokerage LLC');
  assert.equal(prose.documents[0].fields.broker.value,null);assert.equal(prose.documents[0].fields.carrier.value,null);
});

test('agreement company labels cannot inherit a distant or spatially unrelated role',()=>{
  const distant=read(signedCarrierAgreement.replace('BROKER\nCompany','BROKER\nSigned by: Synthetic Signer\nCompany'));
  assert.equal(distant.documents[0].fields.broker.value,null);
  const observation=textObservation(signedCarrierAgreement);observation.sourceImageId='synthetic-agreement';
  observation.lines.forEach((line,index)=>{line.box={x:.1,y:.02+index*.04,width:.35,height:.02};line.confidence=.98;});
  observation.lines.find(line=>line.text==='Company Name: Synthetic Brokerage LLC').box.x=.55;
  const result=readDocument({documentId:'agreement-columns',pages:[{observations:[observation]}]});
  assert.equal(result.documents[0].fields.broker.value,null);assert.equal(result.documents[0].fields.carrier.value,'Synthetic Transport LLC');proof(result);
});

test('uncertain agreement role labels keep their company values unresolved',()=>{
  for(const weakText of ['BROKER CARRIER AGREEMENT','BROKER','Company Name: Synthetic Brokerage LLC']){
    const observation=textObservation(signedCarrierAgreement);
    observation.lines.forEach(line=>{line.confidence=line.text===weakText ? .4 : .98;});
    const result=readDocument({documentId:'weak-agreement',pages:[{observations:[observation]}]});
    assert.equal(result.documents[0].fields.broker.value,null,weakText);assert.equal(result.documents[0].fields.broker.status,'needs_review');proof(result);
  }
});
