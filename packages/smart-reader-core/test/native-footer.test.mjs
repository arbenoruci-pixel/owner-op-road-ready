import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation} from '../src/index.js';
import {scanWithSourceFields} from '../src/scanFields.js';
import {nativeFooterInput} from './native-footer-fixture.mjs';
const first=x=>x.pages[0].observations[0].lines;
const expected={loadNumber:'TEST-90210',totalRate:'3200.00',carrier:'SAMPLE CARRIER LLC',equipment:'Van or Reefer',
 shipper:'EXAMPLE FOODS (N. ALBANY)',consignee:'EXAMPLE HUB',pickupDate:'2026-11-09',deliveryDate:'2026-11-11',documentDate:'2026-11-09',
 pickupAddress:'123 EXAMPLE WAY NORTH, ALBANY, NY 12207',deliveryAddress:'456 SAMPLE ROAD, MADISON, WI 53703',pickupCity:'ALBANY, NY',deliveryCity:'MADISON, WI',pickupAppointment:'12:00 Apt',deliveryAppointment:'07:00 Apt'};
test('native reference footers map wrapped names, separate addresses and left appointments to one three-page rate',()=>{
 const input=nativeFooterInput(),before=JSON.stringify(input),result=readDocument(input);
 assert.equal(result.documents.length,1);const d=result.documents[0];assert.equal(d.kind,'rate_confirmation');assert.deepEqual(d.pageIds,['page-1','page-2','page-3']);
 for(const [key,value]of Object.entries(expected)){assert.equal(d.fields[key].status,'supported',key);assert.equal(d.fields[key].value,value,key);}
 for(const f of Object.values(d.fields))for(const c of f.candidates)for(const e of [...c.evidence,...c.labelEvidence||[],...c.continuationEvidence||[]])resolveEvidence(result,e);
 const analysis={fields:{}},projected=scanWithSourceFields(analysis,{analysis,result},'rate_confirmation');
 assert.equal(projected.fields.origin,'ALBANY, NY');assert.equal(projected.fields.destination,'MADISON, WI');assert.equal(projected.fields.gross,'3200.00');
 assert.equal(d.canAutoFile,false);assert.equal(JSON.stringify(input),before);
});
test('reading-order appointment columns cannot become pickup values after a reference footer',()=>{
 const input=nativeFooterInput();input.pages[0].observations.push(textObservation('Rate confirmation\nPickup # 884002\nAppointment MADISON, WI 53703 DOT 0000000\nDelivery # 337002',{id:'native-rows',source:'pdf-text-layer'}));
 const f=readDocument(input).documents[0].fields;assert.equal(f.pickupAppointment.value,'12:00 Apt');assert.equal(f.deliveryAppointment.value,'07:00 Apt');
});
test('a weak identical OCR header cannot split native terms, while conflicting references still split',()=>{
 const x=nativeFooterInput(),ocr=structuredClone(x.pages[0].observations[0]);ocr.id='weak-ocr';ocr.source='existing-phone-ocr';for(const l of ocr.lines)l.confidence=.45;x.pages[0].observations.push(ocr);
 assert.equal(readDocument(x).documents.length,1);
 ocr.lines.find(l=>l.text==='TEST-90210').text='TEST-OTHER';assert.ok(readDocument(x).documents.length>1);
});
test('incomplete, weak, duplicate or displaced native stop cells never borrow from another stop',()=>{
 for(const change of [
  lines=>{lines.find(l=>l.text==='Nov 9, 2026'&&l.box.x>.1).text='Not scheduled';},
  lines=>{lines.find(l=>l.text==='123 EXAMPLE WAY NORTH').text='Address missing';},
  lines=>{lines.find(l=>l.text==='ALBANY)').confidence=.5;},
  lines=>{lines.find(l=>l.text==='12:00 Apt').box.y=.336;},
  lines=>{lines.push({...structuredClone(lines.find(l=>l.text==='Pickup # 884002')),id:'duplicate'});},
  lines=>{lines.push({...structuredClone(lines.find(l=>l.text==='Pickup # 884002')),id:'third-stop',text:'Stop 3',box:{x:.36,y:.43,width:.1,height:.012}});},
  lines=>{lines.push({...structuredClone(lines.find(l=>l.text==='12:00 Apt')),id:'second-time',text:'14:00 Apt'});},
  lines=>{lines.find(l=>l.text==='123 EXAMPLE WAY NORTH').box.x=.60;},
 ]){const x=nativeFooterInput();change(first(x));const f=readDocument(x).documents[0].fields;assert.equal(f.pickupAddress.value,null);assert.equal(f.pickupDate.value,null);assert.equal(f.pickupAppointment.value,null);}
});
test('reference, sequence, title and real document boundaries protect native continuations',()=>{
 for(const change of [
  lines=>{lines.find(l=>l.text==='TEST-90210').text='TEST-OTHER';},
  lines=>{lines.find(l=>l.text==='TEST-90210').confidence=.4;},
  lines=>{lines.find(l=>l.text==='Page 3').text='Page 4';},
  lines=>{lines.find(l=>l.text==='Rate confirmation').text='Invoice';},
 ]){const x=nativeFooterInput();change(x.pages[2].observations[0].lines);assert.equal(readDocument(x).documents.length,2);}
 const x=nativeFooterInput();x.pages[2].observations.push(textObservation('Proof of Delivery\nBOL Number: TEST-90210\nReceived by: Example Receiver\nDelivery Date: 2026-11-11'));
 assert.equal(readDocument(x).documents.length,2);
});
