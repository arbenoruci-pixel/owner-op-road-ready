import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation,confirmField} from '../src/index.js';
import {scanWithSourceFields} from '../src/scanFields.js';
import {columnBolInput} from './bol-columns-fixture.mjs';

const fields=input=>readDocument(input).documents[0].fields;
const candidates=field=>[...new Set(field.candidates.map(c=>c.value))];
const simple=text=>({documentId:'aliases',pages:[{observations:[textObservation('BILL OF LADING\nSHIP FROM: Sender\nSHIP TO: Receiver\n'+text)]}]});

test('three-column BOL keeps explicit identifiers and proposes each party from its own column',()=>{
  const input=columnBolInput(),before=structuredClone(input),result=readDocument(input),doc=result.documents[0],f=doc.fields;
  assert.equal(doc.reference,'00654321');assert.equal(f.bolNumber.status,'supported');
  assert.equal(f.poNumber.value,'PO-87654');assert.equal(f.documentDate.value,'2026-09-24');
  assert.deepEqual(candidates(f.shipper),['Northern Water Inc']);
  assert.deepEqual(candidates(f.consignee),['Example Market']);
  assert.deepEqual(candidates(f.carrier),['(EXMP) SAMPLE FREIGHT ING','(EXMP) SAMPLE FREIGHT INC']);
  for(const key of ['shipper','consignee','carrier']){
    assert.equal(f[key].status,'needs_review');assert.equal(f[key].value,null);
    assert.ok(f[key].issues.includes('layout_needs_review'));
  }
  assert.ok(f.carrier.issues.includes('conflicting_reads'));
  assert.equal(f.weight.value,null);assert.equal(f.trailerNumber.value,null);
  assert.equal(doc.canAutoFile,false);assert.equal(result.calibration.automaticAcceptance,false);
  for(const field of Object.values(f))for(const c of field.candidates)for(const e of [...c.evidence,...(c.labelEvidence||[])]){
    const {line}=resolveEvidence(result,e);assert.equal(line.text.slice(e.start,e.end),e.quote);
  }
  assert.deepEqual(input,before);
});

test('combined BOL/delivery aliases stop before an adjacent SO/STO label',()=>{
  for(const label of ['BOL/Delivery No:','BOL / DELIVERY NUMBER:','BOL/DELIVERY #']){
    const f=fields(simple(label+' 00123456 SO/STO No: 009900'));
    assert.equal(f.bolNumber.value,'00123456');assert.deepEqual(candidates(f.bolNumber),['00123456']);
  }
  for(const label of ['Cust. P.O. No:','Cust P.O. No:','Customer PO #'])assert.equal(fields(simple(label+' 001100')).poNumber.value,'001100');
});

test('delivery-only, prior and instructional references never become the BOL number',()=>{
  for(const text of ['Delivery No: 999999','SO/STO No: 999999','Previous BOL/Delivery No: 999999','Original BOL/Delivery No: 999999','Please attach BOL/Delivery No: 999999']){
    assert.equal(fields(simple(text)).bolNumber.candidates.length,0,text);
  }
  assert.equal(fields(simple('BOL/Delivery No: 00123456 SO/STO No: 009900')).bolNumber.value,'00123456');
});

test('conflicting or weak combined identifiers remain unresolved',()=>{
  const input=columnBolInput();input.pages[0].observations[1].lines.find(l=>l.text.startsWith('BOL/')).text='BOL/Delivery No: 00654322';
  const f=fields(input).bolNumber;assert.equal(f.value,null);assert.ok(f.issues.includes('conflicting_reads'));
  const weak=columnBolInput();for(const o of weak.pages[0].observations)for(const l of o.lines)if(l.text.startsWith('BOL/'))l.confidence=.6;
  assert.equal(fields(weak).bolNumber.value,null);assert.ok(fields(weak).bolNumber.issues.includes('weak_recognition'));
});

test('missing company rows never borrow the other column or the corporate page heading',()=>{
  for(const [key,name]of [['shipper','Northern Water Inc'],['consignee','Example Market']]){
    const input=columnBolInput();for(const o of input.pages[0].observations)o.lines=o.lines.filter(l=>l.text!==name);
    assert.equal(fields(input)[key].candidates.length,0,key);
  }
});

test('paired headings still read names placed beside their own labels',()=>{
  const input=columnBolInput();
  for(const o of input.pages[0].observations)for(const [heading,name]of [['FROM','Northern Water Inc'],['TO','Example Market']]){
    const label=o.lines.find(l=>l.text.includes('SHIP '+heading)),value=o.lines.find(l=>l.text===name);
    value.box.x=label.box.x+label.box.width+.008;value.box.y=label.box.y+.002;
  }
  const f=fields(input);
  assert.deepEqual(candidates(f.shipper),['Northern Water Inc']);
  assert.deepEqual(candidates(f.consignee),['Example Market']);
});

test('an unclear first row and competing company cells are not skipped',()=>{
  const input=columnBolInput();
  for(const o of input.pages[0].observations){
    const name=o.lines.find(l=>l.text==='Example Market');
    o.lines.push({...structuredClone(name),text:'Unreadable first row',confidence:.1,box:{...name.box,y:name.box.y-.011,height:.006}});
  }
  assert.deepEqual(candidates(fields(input).consignee),['Unreadable first row']);
  const tied=columnBolInput();
  for(const o of tied.pages[0].observations){const name=o.lines.find(l=>l.text==='Example Market');o.lines.push({...structuredClone(name),text:'Competing company',box:{...name.box,x:.29,width:.10}});}
  assert.equal(fields(tied).consignee.candidates.length,0);
});

test('coordinates and proposals remain observation-local in reordered or cropped reads',()=>{
  const input=columnBolInput();input.pages[0].observations.reverse();
  assert.deepEqual(candidates(fields(input).shipper),['Northern Water Inc']);
  assert.deepEqual(candidates(fields(input).consignee),['Example Market']);
  input.pages[0].observations.push({id:'crop',sourceImageId:'independent-crop',lines:[
    {text:'SHIP FROM:',confidence:.95,box:{x:.02,y:.15,width:.25,height:.28}},
    {text:'Wrong crop name',confidence:.95,box:{x:.03,y:.57,width:.4,height:.3}},
  ]});
  assert.deepEqual(candidates(fields(input).shipper),['Northern Water Inc']);
});

test('footer check times and detached consignment prose cannot become parties',()=>{
  const f=fields(columnBolInput());
  for(const key of ['shipper','consignee','carrier'])assert.ok(f[key].candidates.every(c=>!/^SHIP|^Check|^Chak|^Chay|^on$|affiliates/.test(c.rawValue)));
  const input=columnBolInput();input.pages[0].observations=[input.pages[0].observations[0]];
  input.pages[0].observations[0].lines.push({text:'CARRIER: Explicit Footer Freight',confidence:.95,box:{x:.03,y:.8,width:.3,height:.012}});
  assert.ok(candidates(fields(input).carrier).includes('Explicit Footer Freight'));
});

test('confirmed column proposals feed the saved scan with source evidence and keep manual filing',()=>{
  let result=readDocument(columnBolInput());
  for(const key of ['shipper','consignee']){
    const field=result.documents[0].fields[key],candidate=field.candidates[0];
    result=confirmField(result,{documentId:result.documentId,groupId:result.documents[0].id,field:key,rawValue:candidate.rawValue,
      evidence:candidate.evidence[0],userConfirmed:true,expectedRevision:result.reviewRevision,expectedRawValues:field.candidates.map(c=>c.rawValue)});
  }
  const analysis={fields:{shipper:'SHIP TO:',consignee:'Wrong party'},routing:{autoFile:true}};
  const scan=scanWithSourceFields(analysis,{analysis,result},'bol');
  assert.equal(scan.fields.bolNo,'00654321');assert.equal(scan.fields.poNumber,'PO-87654');
  assert.equal(scan.fields.shipper,'Northern Water Inc');assert.equal(scan.fields.consignee,'Example Market');
  assert.equal(scan.fields.readerSourceFieldsV110393.fields.shipper.status,'confirmed');assert.equal(scan.routing.autoFile,false);
  assert.equal(analysis.fields.shipper,'SHIP TO:');
});
