import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';
import {bolSourceInput} from './bol-source-fixture.mjs';

const fields=input=>readDocument(input).documents[0].fields;
const pass=(input,id)=>input.pages[0].observations.find(o=>o.id===id);
const line=(observation,text)=>observation.lines.find(l=>l.text===text);
const expected={bolNumber:'0012345678',shipper:'NORTHERN FOODS',consignee:'REGIONAL MARKET / TOWN DEPOT NORTH',
  carrier:'J AND K TRANSPORT',trailerNumber:'8042',documentDate:'2026-07-14',poNumber:'24681357',temperature:'-10 F'};

test('the BOL diagnostic recovers header, equipment and parties with exact source evidence',()=>{
  const input=bolSourceInput(),before=JSON.stringify(input),result=readDocument(input),doc=result.documents[0];
  assert.equal(doc.kind,'bol');assert.equal(doc.reference,'0012345678');assert.equal(doc.canAutoFile,false);
  for(const [key,value] of Object.entries(expected)){assert.equal(doc.fields[key].value,value,key);assert.equal(doc.fields[key].status,'supported',key);}
  assert.equal(doc.fields.bolNumber.candidates[0].evidence[0].quote,'0012345678');
  assert.equal(doc.fields.bolNumber.candidates[0].evidence[0].observationId,'sparse');
  assert.equal(doc.fields.bolNumber.candidates[0].evidence[0].box.y,.096);
  assert.ok(doc.fields.carrier.candidates.some(c=>c.rawValue==='JAND K TRANSPORT'));
  for(const f of Object.values(doc.fields))for(const c of f.candidates)for(const e of [...c.evidence,...(c.labelEvidence||[]),...(c.continuationEvidence||[])])resolveEvidence(result,e);
  assert.equal(JSON.stringify(input),before);
  input.pages[0].observations.reverse();
  for(const [key,value] of Object.entries(expected))assert.equal(fields(input)[key].value,value,key+' after reversed observations');
});

test('generic numbers require BOL structure and a local page/date header',()=>{
  for(const change of [
    input=>{line(pass(input,'sparse'),'NO.: 0012345678').text='PO NO.: 0012345678';},
    input=>{line(pass(input,'sparse'),'NO.: 0012345678').text='0012345678';},
    input=>{line(pass(input,'sparse'),'NO.: 0012345678').box.y=.6;},
    input=>{line(pass(input,'sparse'),'PAGE:').box.x=.1;},
    input=>{pass(input,'sparse').lines=pass(input,'sparse').lines.filter(l=>l.text!=='DATE:');},
    input=>{for(const o of input.pages[0].observations)o.lines=o.lines.filter(l=>!l.text.includes('This Bill of Lading'));},
    input=>{for(const o of input.pages[0].observations)for(const l of o.lines)delete l.box;}
  ]){
    const input=bolSourceInput();change(input);
    const doc=readDocument(input).documents[0];assert.equal(doc.fields.bolNumber?.value??null,null);
  }
  const input=bolSourceInput(),number=line(pass(input,'sparse'),'NO.: 0012345678');
  pass(input,'sparse').lines=pass(input,'sparse').lines.filter(l=>l!==number);
  input.pages.push({id:'page-2',observations:[{id:'unrelated',sourceImageId:'unrelated-source',lines:[number]}]});
  assert.equal(fields(input).bolNumber.value,null,'another page cannot supply the number');
});

test('weak and conflicting header numbers remain reviewable, including incomplete third reads',()=>{
  for(const confidence of [.6,null]){
    const weak=bolSourceInput();line(pass(weak,'sparse'),'NO.: 0012345678').confidence=confidence;
    assert.equal(fields(weak).bolNumber.value,null);assert.equal(fields(weak).bolNumber.status,'needs_review');
  }
  for(const incomplete of [false,true]){
    const input=bolSourceInput(),other=pass(input,'source');
    other.lines.push({...structuredClone(line(pass(input,'sparse'),'NO.: 0012345678')),text:'NO.: 0098765432'});
    if(incomplete)other.lines=other.lines.filter(l=>l.text!=='FROM:');
    const result=readDocument(input);
    assert.equal(result.documents[0].reference,null);assert.equal(result.documents[0].fields.bolNumber.value,null);
    assert.ok(result.documents[0].fields.bolNumber.issues.includes('conflicting_reads'));
  }
});

test('equipment labels retain disagreements and do not borrow generic car or delivery numbers',()=>{
  const conflict=bolSourceInput();line(pass(conflict,'clean'),'ROUTE CAR NO.8042 —').text='ROUTE CAR NO.8043 —';
  assert.equal(fields(conflict).trailerNumber.value,null);assert.ok(fields(conflict).trailerNumber.issues.includes('conflicting_reads'));
  for(const label of ['CAR NO.','DELIVERY NO.','SALES ORDER NO.']){
    const input=bolSourceInput();for(const o of input.pages[0].observations)for(const l of o.lines)l.text=l.text.replace('ROUTE CAR NO.',label);
    assert.equal(fields(input).trailerNumber.value,null,label);
  }
});

test('initial/AND spacing needs an expanded source and repeated clear complete joined names',()=>{
  for(const change of [
    input=>{input.pages[0].observations=input.pages[0].observations.filter(o=>!['source','carrier-crop'].includes(o.id));},
    input=>{line(pass(input,'clean'),'CARRIER: J AND K TRANSPORT').confidence=.6;},
    input=>{line(pass(input,'source'),'JAND K TRANSPORT').text='JAND K OTHER TRANSPORT';},
    input=>{line(pass(input,'carrier-crop'),'CARRIER: JAND K TRANSPORT').text='CARRIER: JAND K TRANSPORT #2';}
  ]){
    const input=bolSourceInput();change(input);assert.equal(fields(input).carrier.value,null);
  }
});

test('a single complete consignee block remains reviewable; different facilities stay conflicting',()=>{
  const single=bolSourceInput();single.pages[0].observations=[pass(single,'sparse')];
  assert.equal(fields(single).consignee.status,'needs_review');
  const conflict=bolSourceInput();line(pass(conflict,'source'),'TOWN DEPOT NORTH').text='TOWN DEPOT SOUTH';
  assert.equal(fields(conflict).consignee.value,null);assert.ok(fields(conflict).consignee.issues.includes('conflicting_reads'));
});

test('competing party cells cannot be cleared by agreement in other observations',()=>{
  const input=bolSourceInput(),other=structuredClone(pass(input,'sparse'));other.id='ambiguous';other.sourceImageId='ambiguous-image';
  const value=line(other,'REGIONAL MARKET');
  other.lines.push({...structuredClone(value),text:'OTHER MARKET',box:{...value.box,x:.34,width:.13}});
  input.pages[0].observations.push(other);
  const f=fields(input).consignee;assert.equal(f.value,null);assert.ok(f.issues.includes('ambiguous_party_row'));
});

test('missing units and unreadable unit counts are not manufactured by the recovery',()=>{
  const doc=readDocument(bolSourceInput()).documents[0];
  for(const key of ['weight','netWeight','tareWeight']){assert.equal(doc.fields[key].value,null);assert.ok(doc.fields[key].issues.includes('weight_unit_required'));}
  assert.equal(doc.fields.totalUnits.status,'missing');
  assert.equal(doc.checks.find(c=>c.id==='bol_weight_arithmetic').status,'passed');
});
