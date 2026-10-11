import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,textObservation,resolveEvidence} from '../src/index.js';
import {normalizeValue} from '../src/profiles.js';
import {scanWithSourceFields} from '../src/scanFields.js';
import {routeTableInput} from './rate-vocabulary-fixture.mjs';
const input=text=>({documentId:'synthetic-aliases',pages:[{observations:[textObservation(text)]}]});
const document=(label,value='$4,250.00',heading='Rate Confirmation')=>`${heading}\nShipment ID: TEST-74123\nPickup: SAMPLE PRESS\nDelivery: SAMPLE TOYS\n${label}: ${value}\nFuel surcharge $250.00\nDetention $35/hour\nLayover $150/day\nLate fee $200`;
const totals=['Total','Total Rate','Total Carrier Pay','Total Carrier Payment','Total Carrier Rate','Total Carrier Compensation','Carrier Pay','Carrier Payment','Carrier Rate','Carrier Total Pay','Carrier Compensation','All-in Rate','All In Total','All-in','Agreed Rate','Agreed Carrier Rate','Contract Rate','Confirmed Rate','Flat Rate','Total Freight','Total Freight Charges','Total Charges','Total Amount','Total Amount Due','Grand Total','Total Payment','Total Compensation','Load Rate','Load Pay','Load Total','Rate Total','Rate ($)','Rate'];
test('common whole-label totals keep fees and unit prices separate',()=>{
 for(const label of totals){const result=readDocument(input(document(label))),d=result.documents[0];assert.equal(d.kind,'rate_confirmation',label);assert.equal(d.fields.totalRate.value,'4250.00',label);assert.equal(d.reference,'TEST-74123');}
 for(const value of ['$4,250','USD 4250.00','4250 USD','4,250.00 CAD','$4250','4250.00'])assert.equal(readDocument(input(document('Total',value))).documents[0].fields.totalRate.value,'4250.00',value);
 for(const row of ['Total:$4,250.00','Total=$4,250.00','Total — $4,250.00','Total$4,250.00'])assert.equal(readDocument(input(document('Total').replace('Total: $4,250.00',row))).documents[0].fields.totalRate.value,'4250.00');
});
test('header and reference aliases retain exact identity without guessing missing IDs',()=>{
 for(const title of ['Carrier Rate Confirmation','Broker/Carrier Rate Confirmation','Rate Agreement','Load Confirmation','Freight Confirmation','Shipment Confirmation','PRO # TEST-74123 Rate Confirmation'])assert.equal(readDocument(input(document('Total',undefined,title))).documents[0].kind,'rate_confirmation',title);
 for(const label of ['Load #','PRO No.','Order Number','Shipment ID','Trip #','Reference Number','Ref. #','Confirmation No.']){
  const result=readDocument(input(document('Total').replace('Shipment ID:',label)));assert.equal(result.documents[0].reference,'TEST-74123',label);
 }
 for(const title of ['Please attach Rate Confirmation','NOT A RATE CONFIRMATION','Invoice','Customer Statement'])assert.notEqual(readDocument(input(document('Total',undefined,title))).documents[0].kind,'rate_confirmation');
 const result=readDocument(input(document('Total').replace('Shipment ID: TEST-74123','MC # 123456\nDOT 1234567')));assert.equal(result.documents[0].reference,null);
});
test('fees, unit rates, component charges and mismatched totals cannot become agreed pay',()=>{
 for(const label of ['Detention','Layover','Late Fee','Fuel Surcharge','Line Haul','Rate per Mile','Hourly Rate','Customer Rate','Subtotal'])assert.notEqual(readDocument(input(document(label))).documents[0].kind,'rate_confirmation',label);
 for(const value of ['$3.50 / mile','$35 per hour','$4250 minimum','up to $4250'])assert.notEqual(readDocument(input(document('Total',value))).documents[0].kind,'rate_confirmation',value);
 const x=input(document('Total'));x.pages[0].observations.push(textObservation(document('Agreed Rate','$4,350.00'),{id:'other'}));
 const d=readDocument(x).documents[0];assert.equal(d.fields.totalRate.value,null);assert.ok(d.fields.totalRate.issues.includes('conflicting_reads'));
 x.pages[0].observations=[textObservation(document('Total'))];x.pages[0].observations[0].lines.forEach(l=>l.confidence=.4);assert.equal(readDocument(x).documents[0].fields.totalRate.value,null);
});
test('native route table reads and files both stops, dates, rate, carrier and shared terms without AI',()=>{
 const source=routeTableInput(),before=JSON.stringify(source),result=readDocument(source);assert.equal(result.documents.length,1);
 const d=result.documents[0],f=d.fields;assert.deepEqual(d.pageIds,['page-1','page-2']);
 for(const [key,value]of Object.entries({loadNumber:'TEST-74123',totalRate:'4250.00',carrier:'EXAMPLE CARRIER LLC',equipment:'Van',shipper:'SAMPLE PRESS',consignee:'SAMPLE TOYS',pickupDate:'2026-10-08',deliveryDate:'2026-10-12',documentDate:'2026-10-08',pickupCity:'Albany, NY',deliveryCity:'Madison, WI',pickupAddress:'123 Example St Albany, NY 12207',deliveryAddress:'456 Sample Rd Madison, WI 53703',pickupAppointment:'08:00 - 16:00 Apt',deliveryAppointment:'08:00 - 17:00 Apt'}))assert.equal(f[key].value,value,key);
 for(const field of Object.values(f))for(const c of field.candidates)for(const e of [...c.evidence,...c.labelEvidence||[],...c.continuationEvidence||[]])resolveEvidence(result,e);
 const analysis={fields:{gross:'35',loadNo:'OLD'},evidenceReviewV11036:{issues:[]}},shown=scanWithSourceFields(analysis,{analysis,result},'rate_confirmation');
 assert.equal(shown.fields.gross,'4250.00');assert.equal(shown.fields.origin,'Albany, NY');assert.equal(shown.fields.destination,'Madison, WI');assert.equal(shown.fields.loadNo,'TEST-74123');assert.equal(analysis.fields.gross,'35');
 assert.equal(d.canAutoFile,false);assert.equal(JSON.stringify(source),before);
});
test('incomplete, weak, overlapping and multi-stop native blocks cannot borrow the other stop',()=>{
 for(const change of [
  lines=>{lines.find(l=>l.text==='Oct 8, 2026'&&l.box.x>.3).text='Date unknown';},
  lines=>{lines.find(l=>l.text.startsWith('123 Example')).text='Address unknown';},
  lines=>{lines.find(l=>l.text==='SAMPLE PRESS').confidence=.4;},
  lines=>{lines.find(l=>l.text.startsWith('08:00 - 16')).box.y=.30;},
  lines=>{lines.push({...structuredClone(lines.find(l=>l.text==='Pickup')),id:'extra-stop'});},
 ]){const x=routeTableInput();change(x.pages[0].observations[0].lines);const f=readDocument(x).documents[0].fields;assert.equal(f.pickupAddress.value,null);assert.equal(f.pickupDate.value,null);}
});
test('continuations require matching strong identifiers and consecutive header pages',()=>{
 for(const change of [
  lines=>{lines.find(l=>l.text==='TEST-74123').text='TEST-OTHER';},
  lines=>{lines.find(l=>l.text==='TEST-74123').confidence=.4;},
  lines=>{lines.find(l=>l.text==='Page 2').text='Page 3';},
  lines=>{lines.find(l=>l.text==='Shipment ID').text='Document Ref';},
 ]){const x=routeTableInput();change(x.pages[1].observations[0].lines);assert.equal(readDocument(x).documents.length,2);}
 const duplicate=routeTableInput();duplicate.pages[1]=structuredClone(duplicate.pages[0]);duplicate.pages[1].id='duplicate';duplicate.pages[1].number=2;assert.equal(readDocument(duplicate).documents.length,2);
});
test('named dates validate calendar values while ambiguous numeric dates stay reviewable',()=>{
 for(const text of ['Oct 8, 2026','October 8 2026','Oct. 8, 2026'])assert.equal(normalizeValue('date',text).value,'2026-10-08');
 for(const text of ['Feb 30, 2026','Oct 8','10/08/2026','10/08/26'])assert.equal(normalizeValue('date',text).value,null);
});

test('two unpositioned header references remain conflicting',()=>{
 const x=routeTableInput();x.pages=x.pages.slice(0,1);const o=x.pages[0].observations[0];
 o.lines=[{id:'heading',text:'Rate Confirmation'},{id:'label',text:'Shipment ID'},{id:'a',text:'TEST-ONE'},{id:'b',text:'TEST-TWO'},...o.lines.filter(l=>!['Shipment ID','TEST-74123','Rate Confirmation'].includes(l.text))];
 for(const l of o.lines)delete l.box;
 const d=readDocument(x).documents[0];assert.equal(d.reference,null);assert.ok(d.fields.loadNumber.issues.includes('conflicting_reads'));
});
