import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation} from '../src/index.js';
import {sertifiRateInput} from './sertifi-rate-fixture.mjs';
const field=input=>readDocument(input).documents[0].fields;
const change=(input,id)=>input.pages[0].observations[1].lines.find(l=>l.id===id);
const rewrite=(page,from,to)=>{for(const o of page.observations)for(const l of o.lines)l.text=l.text.replaceAll(from,to);};

test('native stops with side notes and a city-only receiver retain parties, dates and exact source evidence',()=>{
  const input=sertifiRateInput(),before=JSON.stringify(input),result=readDocument(input),f=result.documents[0].fields;
  for(const [key,value] of Object.entries({shipper:'SAMPLE RAIL TERMINAL',consignee:'EXAMPLE RECEIVING LLC',
    pickupDate:'2025-07-12',deliveryDate:'2025-07-14',pickupAddress:'123 EXAMPLE RD, ELWOOD IL 60421',
    pickupAppointment:'07/12/25',deliveryAppointment:'07/14/25 @ 07:00'})){
    assert.equal(f[key].value,value,key);assert.equal(f[key].status,'supported',key);
  }
  assert.equal(f.deliveryAddress.value,null);
  assert.deepEqual(f.deliveryAddress.issues,['incomplete_address']);
  assert.equal(f.deliveryAddress.candidates[0].value,'LINCOLNWOOD IL 60712');
  assert.deepEqual(f.weight.issues,['weight_unit_required']);assert.equal(f.weight.value,null);
  assert.equal(f.totalRate.value,'500.00');assert.equal(f.loadNumber.value,'86420');
  assert.deepEqual(result.documents.map(d=>[d.kind,d.pageIds,d.role]),[
    ['rate_confirmation',['page-1','page-2'],'primary'],['signing_certificate',['page-3'],'supporting']]);
  assert.equal(f.billingEmail.value,'billing@example.test');assert.match(f.detentionTerms.value,/\$30 per hour/);
  assert.equal(result.documents[1].fields.date.value,'2025-07-11');
  assert.match(f.podRequirement.value,/48h OF DELIVERY/);
  for(const doc of result.documents)for(const f of Object.values(doc.fields))for(const c of f.candidates)
    for(const e of [...c.evidence,...c.labelEvidence||[],...c.continuationEvidence||[]])resolveEvidence(result,e);
  assert.equal(JSON.stringify(input),before);assert.deepEqual(result.corrections,[]);
  assert.equal(result.calibration.automaticAcceptance,false);assert.ok(result.documents.every(d=>!d.canAutoFile));
});

test('continuations require matching envelope and PRO, and cannot swallow another complete load',()=>{
  for(const mutate of [
    i=>rewrite(i.pages[1],'20250711111222333','20250711111222999'),
    i=>rewrite(i.pages[1],'86420','86429'),
    i=>rewrite(i.pages[1],'Doc ID:','Other ID:'),
    i=>i.pages[1].observations.push(textObservation('TOTAL RATE 900.00\nPICK 1\nSTOP 1',{id:'second-load'})),
    i=>i.pages[1].observations[0].lines.find(l=>l.text.startsWith('Doc ID')).confidence=.5,
    i=>{i.pages[0].observations.push(textObservation('Carrier: FIRST CARRIER LLC',{id:'carrier'}));i.pages[1].observations.push(textObservation('Carrier: SECOND CARRIER LLC',{id:'carrier'}));},
  ]){
    const input=sertifiRateInput();mutate(input);
    assert.deepEqual(readDocument(input).documents[0].pageIds,['page-1']);
    assert.equal(field(input).billingEmail.status,'missing');
  }
});

test('a certificate footer alone cannot classify an ordinary rate page as a signature page',()=>{
  const input=sertifiRateInput();input.pages[0].observations[0].lines.push({id:'footer',text:'Sertifi Electronic Signature'});
  assert.equal(readDocument(input).documents[0].kind,'rate_confirmation');
  rewrite(input.pages[2],'E-Signed :','Date:');
  assert.equal(readDocument(input).documents.at(-1).kind,'unknown');
});

test('unrelated, weak, invalid or conflicting certificate years remain unresolved',()=>{
  for(const mutate of [
    i=>rewrite(i.pages[2],'20250711111222333','20250711111222999'),
    i=>rewrite(i.pages[2],'07/11/2025','31/31/2025'),
    i=>i.pages[2].observations[0].lines[0].confidence=.5,
    i=>i.pages[2].observations.push(textObservation('E-Signed : 07/11/1925 03:55 PM CDT\nSertifi Electronic Signature\nDocID: 20250711111222333',{id:'conflict'})),
    i=>i.pages.push({...structuredClone(i.pages[0]),id:'different-load'}),
  ]){const input=sertifiRateInput();mutate(input);assert.equal(field(input).pickupDate.value,null);}
});

test('native date order needs an unambiguous companion and keeps invalid dates and ranges unresolved',()=>{
  let input=sertifiRateInput();rewrite(input.pages[0],'07/14/25','07/10/25');
  assert.ok(field(input).pickupDate.issues.includes('ambiguous_date'));
  input=sertifiRateInput();rewrite(input.pages[0],'07/12/25','02/30/25');
  assert.ok(field(input).pickupDate.issues.includes('invalid_date'));
  input=sertifiRateInput();rewrite(input.pages[0],'07/14/25 @ 07:00','07/14/25 @ 07:00 to 07/15/25 @ 08:00');
  assert.ok(field(input).deliveryDate.issues.includes('conflicting_reads'));
});

test('city-only source association rejects extra addresses, weak cells and misleading side-note positions',()=>{
  for(const mutate of [
    i=>change(i,'delivery-city').confidence=.6,
    i=>change(i,'consignee').box.x=.6,
    i=>change(i,'notes').box.x=.111,
    i=>change(i,'pickup-ref').text='OTHER RECEIVER LLC',
    i=>i.pages[0].observations[1].lines.splice(13,0,{id:'extra-city',text:'OTHER CITY IL 60601',confidence:1,box:{x:.111,y:.501,width:.24,height:.011}}),
  ]){const input=sertifiRateInput();mutate(input);assert.notEqual(field(input).consignee.status,'supported');}
});
