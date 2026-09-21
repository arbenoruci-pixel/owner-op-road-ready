import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';
import {restoreConfirmedReading,assertConfirmedReadingPreserved} from '../src/continuity.js';
import {savedReadingReview} from '../src/recovery.js';
import {scanWithSourceFields} from '../src/scanFields.js';
import {shortFormInput,damagedUnitInput,formRow} from './bol-form-fixture.mjs';
const doc=input=>readDocument(input).documents[0];
const edit=(input,find,change)=>{for(const o of input.pages[0].observations)for(const line of o.lines)if(find(line))change(line);};
const verifyProof=result=>{for(const d of result.documents)for(const f of Object.values(d.fields))for(const c of f.candidates)
  for(const e of [...c.evidence,...(c.labelEvidence||[]),...(c.continuationEvidence||[])])resolveEvidence(result,e);};

test('short-form title and consignment rows recover parties, PO and split total weight with original proof',()=>{
  const input=shortFormInput(),before=JSON.stringify(input),result=readDocument(input),d=result.documents[0];
  assert.equal(d.kind,'bol');assert.equal(d.identityStatus,'supported');
  for(const [key,value]of Object.entries({carrier:'SUPPLY CHAIN SOLUTIO',shipper:'Example Kitchen',consignee:'REGIONAL FOODS (ABC)',poNumber:'246810-002',weight:'20188 LB'})){
    assert.equal(d.fields[key].value,value,key);assert.equal(d.fields[key].status,'supported',key);
  }
  for(const key of ['bolNumber','trailerNumber','documentDate'])assert.equal(d.fields[key].status,'missing',key);
  const weight=d.fields.weight.candidates[0];assert.equal(weight.rawValue,'20,188');
  assert.equal(weight.continuationKind,'weight_unit');assert.equal(weight.continuationEvidence[0].quote,'LB');
  assert.equal(weight.evidence[0].box.y,.397);assert.equal(weight.labelEvidence[0].quote,'TOTAL WEIGHT:');
  verifyProof(result);assert.equal(JSON.stringify(input),before);assert.equal(d.canAutoFile,false);
});

test('short-form identity needs its heading and independent labels',()=>{
  for(const removed of ['STRAIGHT BILL','Name of Carrier:','Consigned to:','TOTAL WEIGHT:']){
    const input=shortFormInput();for(const o of input.pages[0].observations)o.lines=o.lines.filter(l=>!l.text.startsWith(removed)&&l.box.y<.4);
    assert.equal(doc(input).kind,'unknown',removed);
  }
  const input=shortFormInput();edit(input,l=>l.text.startsWith('STRAIGHT BILL'),l=>{l.text='Please attach a STRAIGHT BILL OF LADING - SHORT FORM';});
  assert.equal(doc(input).kind,'unknown');
});

test('company qualifiers still conflict and boilerplate never becomes a company',()=>{
  const input=shortFormInput();input.pages[0].observations[1].lines.find(l=>l.text.startsWith('Consigned to:')).text='Consignedto: REGIONAL FOODS (ABD)';
  const d=doc(input);assert.equal(d.fields.consignee.value,null);assert.ok(d.fields.consignee.issues.includes('conflicting_reads'));
  assert.equal(d.fields.carrier.candidates.length,1);assert.equal(d.fields.shipper.candidates.length,1);
});

test('split weight units require one strong number and unit on the label baseline',()=>{
  const changes=[
    input=>edit(input,l=>l.text==='LB',l=>{l.confidence=.6;}),
    input=>edit(input,l=>l.text==='LB',l=>{l.box.y=.42;}),
    input=>edit(input,l=>l.text==='LB',l=>{l.box.x=.93;}),
    input=>{for(const o of input.pages[0].observations)o.lines.push(formRow('KG',.89,.397,.02,.008));},
    input=>{for(const o of input.pages[0].observations)o.lines.push(formRow('20,189',.84,.397,.024,.008));},
    input=>{for(const o of input.pages[0].observations)o.lines=o.lines.filter(l=>l.text!=='LB');}
  ];
  for(const change of changes){const input=shortFormInput();change(input);assert.equal(doc(input).fields.weight.value,null);}
  const input=shortFormInput();input.pages[0].observations[1].lines.find(l=>l.text==='LB').text='KG';
  assert.ok(doc(input).fields.weight.issues.includes('conflicting_reads'));
});

test('two clear same-page Ibs readings recover LB while preserving the exact unit text',()=>{
  const input=damagedUnitInput(),before=JSON.stringify(input),result=readDocument(input),d=result.documents[0];
  assert.equal(d.fields.weight.value,'2377.44 LB');assert.equal(d.fields.weight.status,'supported');
  assert.equal(d.fields.weight.candidates[0].rawValue,'2377.44 Ibs');assert.equal(d.fields.weight.candidates[0].issue,'ocr_weight_unit');
  assert.equal(d.fields.totalUnits.value,'4');assert.equal(d.fields.netWeight.status,'missing');
  assert.equal(d.fields.carrier.value,null);assert.ok(d.fields.carrier.issues.includes('form_instructions'));
  verifyProof(result);assert.equal(JSON.stringify(input),before);
});

test('Ibs cannot borrow weak reads, another page, missing units or conflicting numbers or units',()=>{
  for(const change of [
    input=>input.pages[0].observations.pop(),
    input=>{input.pages[0].observations[1].lines.find(l=>l.text.includes('2377.44')).confidence=.6;},
    input=>{input.pages.push({id:'p2',observations:[input.pages[0].observations.pop()]});},
    input=>{input.pages[0].observations[1].lines.find(l=>l.text.includes('2377.44')).text='Total Weight: 2377.44';},
    input=>{input.pages[0].observations[1].lines.find(l=>l.text.includes('2377.44')).text='Total Weight: 2377.44 KG';},
    input=>{input.pages[0].observations[1].lines.find(l=>l.text.includes('2377.44')).text='Total Weight: 2377.45 Ibs';}
  ]){const input=damagedUnitInput();change(input);assert.equal(doc(input).fields.weight.value,null);}
});

test('a numbered B/8 alternative stays reviewable with both exact header sources',()=>{
  const result=readDocument(damagedUnitInput()),d=result.documents[0],f=d.fields.bolNumber;
  assert.equal(d.reference,null);assert.equal(f.value,null);assert.ok(f.issues.includes('identifier_fragments'));
  assert.deepEqual(f.candidates.map(c=>c.rawValue),['AB8565','ABB565']);verifyProof(result);
  for(const change of [l=>{l.text='ABB565';},l=>{l.box.y=.6;},l=>{l.text='PO Number: ABB565';},l=>{l.text='Number: XYB565';}]){
    const input=damagedUnitInput(),line=input.pages[0].observations[1].lines.at(-1);change(line);
    assert.equal(doc(input).fields.bolNumber.value,'AB8565');
  }
});

test('old Ngme confirmation remains in history with a warning and cannot supply the filing carrier',()=>{
  const input=damagedUnitInput(),original=readDocument(input),previous=savedReadingReview(original);
  const field=previous.documents[0].fields.carrier={value:'Ngme:',status:'confirmed',issues:[],correction:{value:'Ngme:',confirmed:true,origin:'human'}};
  const before=JSON.stringify(previous),result=restoreConfirmedReading(original,previous);
  assert.equal(result.documents[0].fields.carrier.value,'Ngme:');assert.match(result.continuityWarning,/form label/);
  assert.deepEqual(result.documents[0].fields.carrier.correction,field.correction);
  assertConfirmedReadingPreserved(previous,savedReadingReview(result));assert.equal(JSON.stringify(previous),before);
  const analysis={type:{id:'bol'},fields:{carrierName:'Ngme:',weight:'WRONG'},routing:{autoFile:false}};
  const shown=scanWithSourceFields(analysis,{analysis,result},'bol');
  assert.equal(shown.fields.carrierName,undefined);assert.equal(shown.fields.weight,'2377.44 LB');
  assert.equal(shown.fields.totalUnits,'4');assert.equal(shown.fields.totalPieces,undefined);
  assert.ok(shown.evidenceReviewV11036.issues.some(s=>s.includes('form label')));
  assert.equal(analysis.fields.carrierName,'Ngme:');
  const real=damagedUnitInput();edit(real,l=>l.text==='Carrier Ngme:',l=>{l.text='Carrier: Ngme Logistics';});
  assert.equal(doc(real).fields.carrier.value,'Ngme Logistics');
});
