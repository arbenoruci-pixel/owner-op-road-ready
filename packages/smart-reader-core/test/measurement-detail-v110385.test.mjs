import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,confirmField} from '../src/index.js';
import {clearestCandidate} from '../src/reviewEvidence.js';
import {fieldMatches} from '../src/layout.js';
import {bolMeasurementFields} from '../src/bolMeasurements.js';

const row=(text,x,y,width,height,confidence=.96)=>({text,box:{x,y,width,height},confidence});
// A narrow row crop is its own coordinate space. A border inflates the number
// box, and the recognizer returns the number before the separate label.
const strip=(text='2,500.75]',label='TOTAL WEIGHT:')=>[
  row(text,.766,.126,.192,.747,.3615),
  row(label,.043,.274,.363,.379,.9653)
];
const observation=(id,lines)=>({id,source:'existing-phone-ocr',sourceImageId:'image-'+id,lines});
const input=(lines=strip())=>({documentId:'synthetic-detail',pages:[{id:'page',observations:[
  observation('whole',[
    row('BILL OF LADING',.05,.02,.5,.015),row('B/L NO: 0012345000',.7,.1,.28,.015),
    row('SHIPPER: EXAMPLE FOODS',.03,.2,.4,.015),row('CONSIGNEE: REGIONAL MARKET',.03,.3,.4,.015),
    row('TOTAL NET WEIGHT: 2,000.25',.49,.82,.31,.015),
    row('TOTAL TARE: 500.50',.03,.85,.3,.015),
    row('TOTAL WEIGHT: 2,500.75f',.49,.85,.31,.015)
  ]),observation('detail',lines)
]}]});

test('split detail binds the observed total with exact number, label, crop and weak confidence',()=>{
  const result=readDocument(input()),group=result.documents[0],field=group.fields.weight;
  const candidate=field.candidates.find(c=>c.numericValue==='2500.75');assert.ok(candidate);
  assert.equal(candidate.rawValue,'2,500.75');assert.equal(candidate.unit,null);
  const evidence=candidate.evidence[0];
  assert.equal(evidence.sourceImageId,'image-detail');assert.equal(evidence.recognizerConfidence,.3615);
  assert.equal(evidence.supportMethod,'isolated_measurement_detail');
  assert.equal(resolveEvidence(result,evidence).line.text,'2,500.75]');
  assert.deepEqual(evidence.box,strip()[0].box);
  assert.equal(candidate.labelEvidence[0].quote,'TOTAL WEIGHT:');
  resolveEvidence(result,candidate.labelEvidence[0]);
  assert.equal(field.status,'needs_review');assert.equal(field.value,null);
  for(const issue of ['invalid_weight','weight_unit_required','weak_recognition'])assert.ok(field.issues.includes(issue),issue);
  assert.equal(group.checks.find(c=>c.id==='bol_weight_arithmetic').status,'passed');
  assert.equal(group.canAutoFile,false);
  assert.throws(()=>confirmField(result,{documentId:result.documentId,groupId:group.id,field:'weight',rawValue:'2500.75',evidence,userConfirmed:true,expectedRevision:0,expectedRawValues:field.candidates.map(c=>c.rawValue)}),/ambiguous or invalid/);
});

test('detail binding respects the actual label and keeps explicit-unit proposals for review',()=>{
  for(const [key,label]of [['weight','GROSS WEIGHT:'],['netWeight','NET WEIGHT:'],['tareWeight','TOTAL TARE:']]){
    const lines=strip('2,500.75 KG]',label);lines[0].confidence=.99;
    const result=readDocument(input(lines)),field=result.documents[0].fields[key];
    const candidate=field.candidates.find(c=>c.unit==='KG');assert.ok(candidate,key);
    assert.equal(candidate.numericValue,'2500.75');assert.equal(candidate.issue,'layout_needs_review');
    assert.equal(field.status,'needs_review');assert.equal(field.value,null);
    for(const other of ['weight','netWeight','tareWeight'].filter(other=>other!==key))assert.ok(!result.documents[0].fields[other].candidates.some(c=>c.unit==='KG'));
  }
});

test('isolated details cannot bypass full-page row guards or ambiguous, incomplete and unrelated text',()=>{
  const cases=[
    strip().map(line=>({...line,box:{...line.box,y:line.box.y/20,height:line.box.height/20}})),
    [...strip(),row('NET WEIGHT:',.02,.01,.4,.13)],
    [...strip(),row('9,999.00',.6,.01,.2,.13)],
    strip('2,500.75f'),strip('2,500.'),strip('2,500.75 9,999.00'),strip('2,500.75 PER'),
    strip('2,500.75]','TOTAL UNITS:'),
    [strip()[0],{...strip()[1],box:{x:.043,y:.02,width:.363,height:.12}}],
    [{...strip()[0],box:{x:.2,y:.126,width:.192,height:.747}},strip()[1]],
    strip().map(({box,...line})=>line)
  ];
  for(const lines of cases)assert.deepEqual(fieldMatches(lines,bolMeasurementFields.weight),[],JSON.stringify(lines));
});

test('source review opens a complete numeric proposal without erasing invalid reads or conflicts',()=>{
  const result=readDocument(input()),field=result.documents[0].fields.weight,before=structuredClone(field);
  const choice=clearestCandidate(field.candidates);
  assert.equal(choice.candidate.numericValue,'2500.75');assert.equal(choice.evidence.observationId,'detail');
  assert.equal(clearestCandidate(field.candidates,e=>e.observationId==='whole').candidate.issue,'invalid_weight');
  assert.deepEqual(field,before);
  const changed=input();changed.pages[0].observations.push(observation('other',strip('2,600.75]')));
  const conflict=readDocument(changed).documents[0];
  assert.ok(conflict.fields.weight.issues.includes('conflicting_reads'));
  assert.equal(conflict.fields.weight.value,null);
  assert.equal(conflict.checks.find(c=>c.id==='bol_weight_arithmetic').status,'not_checked');
});
