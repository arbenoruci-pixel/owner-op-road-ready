import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation} from '../src/index.js';
import {nativePdfLayout} from '../src/pdfLayout.js';
import {rateInput,rateText} from './rate-confirmation-fixture.mjs';

const certificate=(ref='SYNTHETIC-REFERENCE',date='16 SEP 2026')=>({id:'certificate',observations:[textObservation(
  `REF. NUMBER DOCUMENT COMPLETED BY ALL PARTIES ON\n${ref} ${date} 18:30:00\nSIGNER TIMESTAMP SIGNATURE\nSIGNED\nSigned with PandaDoc`)]});
const packet=()=>({...rateInput(),pages:[...rateInput().pages,certificate()]});

test('short RateCon dates retain exact evidence and use only the matching certificate year',()=>{
  const input=packet(),before=JSON.stringify(input),result=readDocument(input),fields=result.documents[0].fields;
  for(const [key,value] of [['pickupDate','2026-09-16'],['deliveryDate','2026-09-22']]){
    assert.equal(fields[key].candidates[0].value,value);
    assert.deepEqual(fields[key].issues,['layout_needs_review']);
    assert.ok(fields[key].candidates[0].labelEvidence.some(e=>e.pageId==='certificate'&&e.quote==='16 SEP 2026'));
    assert.equal(fields[key].value,null,'year context does not remove layout review');
  }
  for(const doc of result.documents)for(const field of Object.values(doc.fields))for(const c of field.candidates)
    for(const e of [...c.evidence,...(c.labelEvidence||[])])resolveEvidence(result,e);
  assert.equal(result.documents[0].canAutoFile,false);assert.equal(JSON.stringify(input),before);
});

test('missing, unrelated, weak, invalid and conflicting certificate evidence cannot establish a century',()=>{
  const cases=[rateInput(),{...rateInput(),pages:[...rateInput().pages,certificate('ANOTHER-REFERENCE')]},
    {...rateInput(),pages:[...rateInput().pages,certificate('SYNTHETIC-REFERENCE','31 FEB 2026')]},
    {...rateInput(),pages:[...rateInput().pages,certificate('SYNTHETIC-REFERENCE','16 SEP 2025')]}];
  const weak=packet();weak.pages[1].observations[0].lines[1].confidence=.5;cases.push(weak);
  const conflict=packet();conflict.pages[1].observations.push({...certificate('SYNTHETIC-REFERENCE','16 SEP 1926').observations[0],id:'retry'});cases.push(conflict);
  const duplicate=packet();duplicate.pages.push({...rateInput().pages[0],id:'another-ratecon'});cases.push(duplicate);
  for(const input of cases)assert.equal(readDocument(input).documents[0].fields.pickupDate.candidates[0].value,null);
});

test('a linked century cannot decide ambiguous month/day order or collapse multi-day appointments',()=>{
  let input=packet();input.pages[0].observations=[textObservation(rateText.replaceAll('09/16/26','09/11/26'))];
  assert.ok(readDocument(input).documents[0].fields.pickupDate.issues.includes('ambiguous_date'));
  input=packet();input.pages[0].observations=[textObservation(rateText.replace('to 09/22/26','to 09/23/26'))];
  const field=readDocument(input).documents[0].fields.deliveryDate;
  assert.deepEqual(field.candidates.map(c=>c.value),['2026-09-22','2026-09-23']);
  assert.ok(field.issues.includes('conflicting_reads'));
});

const parties=['C','EXAMPLE TRANSPORT LLC','A','(212) 555-0100 (p)','R',
  'EXAMPLE FREIGHT LLC (212) 555-0100 (f)','R','100 SAMPLE RD I MC # 123456 Truck #',
  'BUILDING 2 SUITE 300 E DOT 1234567 Trailer #','ALBANY NY 12207 R Driver SAMPLE DRIVER Cell # (212) 555-0100'];
const partyText=rateText.replace('EXAMPLE FREIGHT LLC',parties.join('\n'))+'\nSend Carrier Bills to the Address Above PRO # 86420 must appear on all Invoices';

test('flattened vertical carrier and billing blocks propose companies with full source evidence',()=>{
  const result=readDocument(rateInput(partyText)),fields=result.documents[0].fields;
  assert.equal(fields.carrier.candidates[0].value,'EXAMPLE TRANSPORT LLC');
  assert.equal(fields.broker.candidates[0].value,'EXAMPLE FREIGHT LLC');
  for(const key of ['carrier','broker']){
    assert.equal(fields[key].status,'needs_review');
    for(const c of fields[key].candidates)for(const e of [...c.evidence,...c.labelEvidence])resolveEvidence(result,e);
  }
});

test('partial vertical labels and missing billing directions do not invent company roles',()=>{
  let fields=readDocument(rateInput(partyText.replace('E DOT','X DOT'))).documents[0].fields;
  assert.equal(fields.carrier.status,'missing');assert.equal(fields.broker.status,'missing');
  fields=readDocument(rateInput(partyText.replace('Send Carrier Bills to the Address Above','Other instructions'))).documents[0].fields;
  assert.equal(fields.broker.status,'missing');
  fields=readDocument(rateInput(partyText+'\nCarrier: DIFFERENT CARRIER LLC')).documents[0].fields;
  assert.ok(fields.carrier.issues.includes('conflicting_reads'));
});

export const item=(str,x,y,width=100)=>({str,width,transform:[10,0,0,10,x,y],fontName:'regular'});
export const viewport={width:1224,height:1584,transform:[2,0,0,-2,0,1584]};
test('native PDF layout uses render coordinates, keeps column gaps and preserves text items',()=>{
  const content={items:[item('LEFT COMPANY LLC',30,700,100),item('RIGHT COMPANY LLC',330,700,110),
    item('PICK',30,650,25),item('1',70,650,6)],styles:{regular:{ascent:.8}}};
  const snapshot=JSON.stringify(content),lines=nativePdfLayout(content,viewport);
  assert.deepEqual(lines.map(l=>l.text),['LEFT COMPANY LLC','RIGHT COMPANY LLC','PICK 1']);
  assert.deepEqual(lines[0],{text:'LEFT COMPANY LLC',left:60,top:168,width:200,height:20,confidence:100});
  assert.equal(lines[1].left,660);assert.equal(JSON.stringify(content),snapshot);
});

test('unsupported rotation, missing geometry and clipped PDF content fall back without fabricated boxes',()=>{
  for(const content of [{items:[{str:'no geometry'}]}, {items:[item('off page',-20,700)]},
    {items:[{...item('vertical',30,700),transform:[0,10,-10,0,30,700]}]}])assert.deepEqual(nativePdfLayout(content,viewport),[]);
  assert.deepEqual(nativePdfLayout({items:[item('text',30,700)]},{width:100,height:100}),[]);
});

test('positioned appointment cells do not interrupt their own street and city evidence',()=>{
  const input=rateInput();const o=input.pages[0].observations[0];o.sourceImageId='synthetic-page';
  const idx=o.lines.findIndex(l=>l.text.startsWith('456 SAMPLE ST'));
  const street=o.lines[idx];street.text='456 SAMPLE ST';street.box={x:.1,y:.6,width:.25,height:.015};
  const city=o.lines[idx+1];city.box={x:.1,y:.62,width:.3,height:.015};
  o.lines.splice(idx+1,0,{id:'appointment-cell',text:'Appointment 09/22/26 08:00',box:{x:.52,y:.6,width:.4,height:.015}});
  let fields=readDocument(input).documents[0].fields;
  assert.equal(fields.deliveryAddress.candidates[0].value,'456 SAMPLE ST, MADISON WI 53703');
  assert.equal(fields.consignee.candidates[0].value,'EXAMPLE RECEIVING LLC');
  o.lines[idx+1].box.x=.1;
  fields=readDocument(input).documents[0].fields;
  assert.equal(fields.deliveryAddress.status,'missing','an intervening row inside the address column remains a boundary');
  assert.equal(fields.consignee.status,'missing');
});

test('vertical carrier support requires native, aligned, strong label evidence',()=>{
  const input=rateInput();const o=input.pages[0].observations[0];o.source='pdf-text-layer';o.sourceImageId='native-page';
  const letters=[...'CARRIER'].map((text,i)=>({id:'letter-'+i,text,confidence:1,box:{x:.48,y:.1+i*.014,width:.012,height:.012}}));
  const name={id:'company',text:'EXAMPLE TRANSPORT LLC',confidence:1,box:{x:.52,y:.102,width:.35,height:.012}};
  o.lines.splice(2,0,...[letters[0],name,...letters.slice(1)]);
  let field=readDocument(input).documents[0].fields.carrier;
  assert.equal(field.value,'EXAMPLE TRANSPORT LLC');
  letters[2].confidence=.4;field=readDocument(input).documents[0].fields.carrier;
  assert.equal(field.value,null);assert.ok(field.issues.includes('weak_recognition'));
  letters[2].confidence=1;o.source='existing-phone-ocr';
  assert.equal(readDocument(input).documents[0].fields.carrier.status,'needs_review');
});
