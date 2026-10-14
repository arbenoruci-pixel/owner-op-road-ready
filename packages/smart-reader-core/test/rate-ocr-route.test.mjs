import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';
import {routeTableInput} from './rate-vocabulary-fixture.mjs';
const ocr=()=>{
 const x=routeTableInput();
 x.documentId='synthetic-ocr-route-table';
 for(const page of x.pages)for(const o of page.observations){o.source='existing-phone-ocr';o.id='ocr-table';for(const l of o.lines)l.confidence=.96;}
 return x;
};
const lines=x=>x.pages[0].observations[0].lines;
const first=x=>readDocument(x).documents[0];
const required=['loadNumber','totalRate','pickupAddress','pickupAppointment','deliveryAddress','deliveryAppointment'];
const expected={loadNumber:'TEST-74123',totalRate:'4250.00',carrier:'EXAMPLE CARRIER LLC',equipment:'Van',shipper:'SAMPLE PRESS',consignee:'SAMPLE TOYS',pickupDate:'2026-10-08',deliveryDate:'2026-10-12',documentDate:'2026-10-08',pickupCity:'Albany, NY',deliveryCity:'Madison, WI',pickupAddress:'123 Example St Albany, NY 12207',deliveryAddress:'456 Sample Rd Madison, WI 53703',pickupAppointment:'08:00 - 16:00 Apt',deliveryAppointment:'08:00 - 17:00 Apt'};

test('positioned OCR reads explicit route cells and joins matching terms without inventing native provenance',()=>{
 const x=ocr(),before=structuredClone(x),r=readDocument(x),d=r.documents[0];
 assert.equal(r.documents.length,1);assert.equal(d.kind,'rate_confirmation');assert.deepEqual(d.pageIds,['page-1','page-2']);
 assert.deepEqual(Object.keys(d.fields).filter(k=>d.fields[k].required),required);
 for(const [key,value]of Object.entries(expected)){
  const f=d.fields[key];assert.equal(f.value,value,key);assert.equal(f.status,'supported',key);
  for(const c of f.candidates)for(const e of [...c.evidence,...c.labelEvidence||[],...c.continuationEvidence||[]]){
   resolveEvidence(r,e);assert.equal(e.source,'existing-phone-ocr');if(e.supportMethod)assert.ok(e.supportMethod.startsWith('ocr_'));
  }
 }
 assert.equal(d.fields.broker.value,null,'never infer broker from a logo or boilerplate');
 assert.equal(d.canAutoFile,false);assert.deepEqual(x,before);
});

test('native route behavior remains unchanged',()=>{
 const d=first(routeTableInput());for(const [key,value]of Object.entries(expected))assert.equal(d.fields[key].value,value,key);
 assert.deepEqual(d.pageIds,['page-1','page-2']);
});

test('weak or missing OCR confidence cannot support values from intact-looking cells',()=>{
 const cases=[['Shipment ID','loadNumber'],['Rate Confirmation','totalRate'],['Total','totalRate'],['Pickup','pickupAddress'],['Delivery','deliveryAddress'],['SAMPLE PRESS','shipper'],['08:00 - 16:00 Apt','pickupAppointment'],['EXAMPLE CARRIER LLC','carrier'],['Carrier','carrier'],['$4,250.00','totalRate']];
 for(const [text,key]of cases)for(const confidence of [.4,null]){
  const x=ocr();x.pages=x.pages.slice(0,1);
  for(const l of lines(x).filter(l=>l.text===text))l.confidence=confidence;
  const f=first(x).fields[key];assert.equal(f.value,null,text+' '+confidence);assert.equal(f.status,'needs_review',text+' '+confidence);
 }
});

test('OCR geometry, source identity and complete labels remain mandatory',()=>{
 for(const change of [
  x=>{for(const l of lines(x))delete l.box;},
  x=>{for(const l of lines(x))delete l.box;delete x.pages[0].observations[0].sourceImageId;},
  x=>{x.pages[0].observations[0].source='text-input';},
  x=>{lines(x).find(l=>l.text==='Shipment ID').text='Identifier';},
 ]){
  const x=ocr();x.pages=x.pages.slice(0,1);change(x);
  assert.equal(first(x).fields.loadNumber.value,null);
 }
 for(const change of [
  ls=>{ls.find(l=>l.text==='Pickup').text='';},
  ls=>{ls.find(l=>l.text.startsWith('123 Example')).text='Address unknown';},
  ls=>{ls.find(l=>l.text==='Oct 8, 2026'&&l.box.x>.3).text='Date unknown';},
  ls=>{ls.find(l=>l.text==='08:00 - 16:00 Apt').box.y=.30;},
  ls=>{ls.push({...structuredClone(ls.find(l=>l.text==='Pickup')),id:'extra-stop'});},
 ]){
  const x=ocr();x.pages=x.pages.slice(0,1);change(lines(x));const d=first(x);
  assert.equal(d.fields.pickupAddress?.value??null,null);assert.equal(d.fields.pickupDate?.value??null,null);
 }
});

test('ambiguous OCR amounts cannot choose a convenient first cell',()=>{
 const x=ocr();x.pages=x.pages.slice(0,1);const ls=lines(x),total=ls.find(l=>l.text==='$4,250.00'&&l.box.y>.45);
 ls.push({...structuredClone(total),id:'alternative-rate',text:'$4,350.00',box:{...total.box,x:.7}});
 assert.equal(first(x).fields.totalRate.value,null);
});

test('conflicting rates or stop readings across OCR observations stay unresolved',()=>{
 for(const [text,key,replacement]of [['$4,250.00','totalRate','$4,350.00'],['08:00 - 16:00 Apt','pickupAppointment','09:00 - 16:00 Apt'],['SAMPLE PRESS','shipper','ANOTHER PRESS']]){
  const x=ocr();x.pages=x.pages.slice(0,1);const other=structuredClone(x.pages[0].observations[0]);other.id='second-ocr';other.sourceImageId='other-image';
  for(const l of other.lines)if(l.text===text)l.text=replacement;
  x.pages[0].observations.push(other);const f=first(x).fields[key];assert.equal(f.value,null,key);assert.ok(f.issues.includes('conflicting_reads'),key);
 }
});

test('incomplete observations never pool separate route cells',()=>{
 const x=ocr();x.pages=x.pages.slice(0,1);const a=x.pages[0].observations[0],b=structuredClone(a);b.id='partial-second';b.sourceImageId='partial-second-image';
 a.lines=a.lines.filter(l=>l.text!=='Pickup');b.lines=b.lines.filter(l=>l.text!=='Delivery');x.pages[0].observations.push(b);
 const d=first(x);for(const key of ['pickupAddress','deliveryAddress','totalRate'])assert.equal(d.fields[key]?.value??null,null);
});

test('OCR continuation requires confident, consecutive, matching headers',()=>{
 for(const change of [
  ls=>{ls.find(l=>l.text==='TEST-74123').text='TEST-OTHER';},
  ls=>{ls.find(l=>l.text==='TEST-74123').confidence=.4;},
  ls=>{ls.find(l=>l.text==='Shipment ID').confidence=null;},
  ls=>{ls.find(l=>l.text==='Rate Confirmation').confidence=.4;},
  ls=>{ls.find(l=>l.text==='Page 2').confidence=null;},
  ls=>{ls.find(l=>l.text==='Page 2').text='Page 3';},
 ]){const x=ocr();change(x.pages[1].observations[0].lines);assert.equal(readDocument(x).documents.length,2);}
});
