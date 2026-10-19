import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';
import {scanWithSourceFields} from '../src/scanFields.js';
import {carrierTableInput,labeledRateInput} from './reliability-rate-fixture.mjs';
const project=(result,fields={})=>{const analysis={type:{id:'rate_confirmation'},fields};return scanWithSourceFields(analysis,{analysis,result},'rate_confirmation');};
const allEvidence=result=>{for(const doc of result.documents)for(const field of Object.values(doc.fields))for(const candidate of field.candidates)for(const ref of [...candidate.evidence,...(candidate.labelEvidence||[]),...(candidate.continuationEvidence||[])])resolveEvidence(result,ref);};

test('a labeled carrier table reads source fields without borrowing the billing address or unlabeled numbers',()=>{
  const input=carrierTableInput(),before=JSON.stringify(input),result=readDocument(input),doc=result.documents[0];
  assert.equal(doc.kind,'rate_confirmation');
  for(const [key,value]of Object.entries({loadNumber:'TEST-90210',poNumber:'TEST-90210',broker:'TQL',carrier:'EXAMPLE CARRIER LLC',totalRate:'2350.00',equipment:'Van',pickupCity:'Albany, NY',deliveryCity:'Madison, WI',pickupDate:'2026-10-16',deliveryDate:'2026-10-18',pickupAppointment:'13:30',deliveryAppointment:'06:00'}))assert.equal(doc.fields[key].value,value,key);
  for(const key of ['shipper','consignee','pickupAddress','deliveryAddress','documentDate'])assert.equal(doc.fields[key].value,null,key);
  assert.equal(result.documents.length,4);assert.equal(result.pageCount,4);assert.equal(JSON.stringify(input),before);allEvidence(result);
  const shown=project(result,{pickupAddress:'OLD GUESS',stops:[{type:'pickup',time:'01:00'},{type:'delivery',time:'02:00'}]});
  assert.equal(shown.fields.pickupAddress,undefined);assert.equal(shown.fields.pickupTime,'13:30');assert.equal(shown.fields.deliveryTime,'06:00');
  assert.equal(shown.fields.stops[0].address,'');assert.equal(shown.fields.stops[0].time,'13:30');
  assert.deepEqual(shown.fields.readerSourceSelectionV1.unassignedPageIds,['p2','p3','p4']);
  assert.equal(shown.routing.autoFile,false);assert.equal(shown.fields.readerStopsReviewV1.required,true);
});

test('scan/photo table confidence remains attached to exact source; weak fields require confirmation',()=>{
  for(const source of ['existing-phone-ocr','tesseract-photo']){
    const good=readDocument(carrierTableInput({source,confidence:.95,attachments:false}));
    assert.equal(good.documents[0].fields.pickupAppointment.value,'13:30');allEvidence(good);
    const weak=readDocument(carrierTableInput({source,confidence:.55,attachments:false}));
    assert.equal(weak.documents[0].fields.pickupAppointment.value,null);assert.ok(weak.documents[0].fields.pickupAppointment.issues.includes('weak_recognition'));
  }
});

test('shifted or competing table cells cannot silently supply a date, time or carrier',()=>{
  const input=carrierTableInput({attachments:false});
  const lines=input.pages[0].observations[0].lines;
  lines.find(line=>line.text==='Date').box.x=.70;
  const result=readDocument(input);assert.equal(result.documents[0].fields.pickupDate.value,null);
  const conflict=carrierTableInput({attachments:false}),other=structuredClone(conflict.pages[0].observations[0]);other.id='other';
  other.lines.find(line=>line.text==='Appt 13:30 Note:CONF').text='Appt 14:30 Note:CONF';conflict.pages[0].observations.push(other);
  const reading=readDocument(conflict);assert.equal(reading.documents[0].fields.pickupAppointment.value,null);assert.ok(reading.documents[0].fields.pickupAppointment.issues.includes('conflicting_reads'));
});

test('generic labels and verified terms continuation retain PO, all pages and appointment windows',()=>{
  const input=labeledRateInput(),result=readDocument(input),doc=result.documents[0];
  assert.deepEqual(doc.pageIds,['p1','p2']);assert.equal(result.documents.length,1);
  for(const [key,value]of Object.entries({poNumber:'PO-64318',shipper:'SAMPLE PRESS',consignee:'SAMPLE TOYS',pickupAddress:'123 Example Rd Albany, NY 12207',pickupAppointment:'08:00 - 16:00',deliveryAppointment:'06:00'}))assert.equal(doc.fields[key].value,value,key);
  const shown=project(result,{pickupTime:'01:00',deliveryTime:'02:00',stops:[{type:'pickup',time:'01:00'},{type:'delivery',time:'02:00'}]});
  assert.equal(shown.fields.pickupTime,undefined);assert.equal(shown.fields.pickupAppointment,'08:00 - 16:00');assert.equal(shown.fields.stops[0].time,'');assert.equal(shown.fields.stops[0].appointment,'08:00 - 16:00');assert.equal(shown.fields.deliveryTime,'06:00');allEvidence(result);
  assert.equal(shown.fields.origin,'123 Example Rd Albany, NY 12207');
  assert.equal(shown.fields.readerSourceFieldsV110393.fields.origin.sourceField,'pickupAddress');
  assert.equal(shown.fields.stops[0].city,''); // Full address is not a guessed city.
});

test('a labeled issue date and carrier payment prose do not break verified terms continuation',()=>{
  const input=labeledRateInput();
  input.pages[0].observations[0].lines.push({id:'issue-date',text:'Document Date: 2026-10-12',confidence:1});
  input.pages[1].observations[0].lines.push({id:'payment-prose',text:'Carrier payment requires complete billing documentation.',confidence:1});
  const result=readDocument(input);assert.equal(result.documents.length,1);assert.equal(result.documents[0].fields.documentDate.value,'2026-10-12');assert.deepEqual(result.documents[0].pageIds,['p1','p2']);allEvidence(result);
});

test('different or uncertain document boundaries never become an automatic rate packet',()=>{
  const input=carrierTableInput();input.pages[3].observations[0].lines.at(-1).text='TQL PO# DIFFERENT-888';
  const result=readDocument(input),analysis={type:{id:'rate_confirmation'},fields:{loadNo:'DRIVER-CHOICE'}};
  assert.equal(scanWithSourceFields(analysis,{analysis,result},'rate_confirmation'),analysis);
  const mixed=carrierTableInput();mixed.pages[1].observations[0].lines=[{id:'h',text:'INVOICE # IN-222'},{id:'s',text:'Subtotal $10.00'},{id:'t',text:'Total $10.00'}];
  const reading=readDocument(mixed);assert.equal(project(reading,{loadNo:'UNCHANGED'}).fields.loadNo,'UNCHANGED');
});

test('repeated stop roles remain preserved review proposals, never a guessed two-stop itinerary',()=>{
  const result=readDocument(labeledRateInput()),stops=[{type:'pickup',city:'A'},{type:'delivery',city:'B'},{type:'delivery',city:'C'}],shown=project(result,{stops});
  assert.deepEqual(shown.fields.stops,[]);assert.deepEqual(shown.fields.readerPendingStopsV1,stops);assert.equal(shown.fields.readerStopsReviewV1.reason,'multiple_stops_need_source_review');
});
