import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,exportCorrections} from '../src/index.js';
import {reconcileBolMeasurements,visibleMeasurementCandidates} from '../src/measurementConsensus.js';
import {measurementReviewProposal,confirmMeasurementGroup} from '../src/measurementReview.js';
import {savedReadingReview,reviewQueue} from '../src/recovery.js';
import {restoreConfirmedReading} from '../src/continuity.js';

const row=(text,x=.03,y=.3,width=.4,height=.014,confidence=.96)=>({text,confidence,box:{x,y,width,height}});
function input(){return {documentId:'synthetic-consensus',pages:[{id:'page',observations:[
  {id:'source',sourceImageId:'image-source',lines:[
    row('BILL OF LADING',.05,.02,.5),row('B/L NO: 0012345000',.7,.1,.28),row('SHIPPER: EXAMPLE FOODS',.03,.2),row('CONSIGNEE: REGIONAL MARKET',.03,.3),
    row('TOTAL NET WEIGHT: 2,000.25'),row('TOTAL TARE: 500.50'),row('TOTAL WEIGHT: 2,500.75f')
  ]},
  {id:'partial',sourceImageId:'image-partial',lines:[row('TOTAL WEIGHT: 2,500.'),row('TOTAL NET WEIGHT: 2,000.')]},
  {id:'detail',sourceImageId:'image-detail',lines:[row('2,500.75]',.766,.126,.192,.747,.3615),row('TOTAL WEIGHT:',.043,.274,.363,.379,.9653)]}
]}]};}
const weights=['weight','netWeight','tareWeight'];
const read=v=>readDocument(v||input());
const request=(r,unit='LB')=>({documentId:r.documentId,groupId:r.documents[0].id,unit,userConfirmed:true,expectedRevision:r.reviewRevision,expectedSignature:measurementReviewProposal(r.documents[0])?.signature});

test('matching full digits and arithmetic resolve redundant fragments without changing raw evidence',()=>{
  const r=read(),g=r.documents[0],f=g.fields.weight;
  for(const key of weights)assert.deepEqual(g.fields[key].issues,['weight_unit_required'],key);
  assert.equal(f.numberSupport.method,'matching_measurement_digits');
  assert.equal(f.value,null);assert.equal(f.status,'needs_review');
  assert.deepEqual(visibleMeasurementCandidates(f).map(c=>c.rawValue),['2,500.75']);
  assert.equal(f.candidates.find(c=>c.rawValue==='2,500.75f').issue,'invalid_weight');
  assert.equal(f.candidates.find(c=>c.numericValue).evidence[0].recognizerConfidence,.3615);
  for(const field of Object.values(g.fields))for(const c of field.candidates)for(const e of [...c.evidence,...(c.labelEvidence||[])])resolveEvidence(r,e);
  for(const e of f.numberSupport.evidence)resolveEvidence(r,e);
  assert.equal(g.checks.find(c=>c.id==='bol_weight_arithmetic').status,'passed');
  assert.equal(measurementReviewProposal(g).entries.length,3);assert.equal(g.canAutoFile,false);
});

test('arithmetic alone, weak corroboration and changed digits cannot resolve a weak number',()=>{
  for(const change of [
    v=>{v.pages[0].observations[0].lines.at(-1).text='TOTAL WEIGHT: 2,500.';},
    v=>{v.pages[0].observations[0].lines.at(-1).confidence=.7;},
    v=>{v.pages[0].observations[0].lines.at(-1).text='TOTAL WEIGHT: 2,500.75O';},
    v=>{v.pages[0].observations[0].lines.at(-1).text='TOTAL WEIGHT: 2,500.75L';},
    v=>{v.pages[0].observations[0].lines[4].text='TOTAL NET WEIGHT: 2,001.25';},
    v=>{v.pages[0].observations[2].lines[0].text='2,500.76]';},
    v=>{v.pages[0].observations[2].sourceImageId='image-source';}
  ]){const v=input();change(v);const g=read(v).documents[0];assert.equal(measurementReviewProposal(g),null);assert.ok(g.fields.weight.issues.includes('weak_recognition'));}
});

test('complete shorter numbers, competing units and cross-page evidence stay unresolved',()=>{
  for(const value of ['2,500','2,600.75','2,500.75 KG']){
    const v=input();v.pages[0].observations[1].lines.push(row('TOTAL WEIGHT: '+value));
    const g=read(v).documents[0];assert.ok(g.fields.weight.issues.includes('conflicting_reads'));assert.equal(measurementReviewProposal(g),null);
  }
  const repeated=input();repeated.pages[0].observations[0].lines.push(row('TOTAL NET WEIGHT: 2,000.',.03,.6));
  const repeatedGroup=read(repeated).documents[0];assert.ok(repeatedGroup.fields.netWeight.issues.includes('invalid_weight'));assert.equal(measurementReviewProposal(repeatedGroup),null);
  const fields=read().documents[0].fields;
  for(const c of fields.weight.candidates)if(c.issue==='invalid_weight')for(const e of c.evidence)e.pageId='other-page';
  delete fields.weight.numberSupport;fields.weight.issues=['invalid_weight','weight_unit_required','weak_recognition'];
  const next=reconcileBolMeasurements(fields);assert.ok(next.weight.issues.includes('invalid_weight'));assert.ok(next.weight.issues.includes('weak_recognition'));
});

test('one explicit unit selection confirms all three observed weights and preserves its audit after save',()=>{
  for(const unit of ['LB','KG']){
    const r=read(),before=structuredClone(r),next=confirmMeasurementGroup(r,request(r,unit));
    assert.deepEqual(r,before);assert.equal(next.reviewRevision,3);assert.equal(next.corrections.length,3);
    for(const key of weights){const f=next.documents[0].fields[key];assert.equal(f.status,'confirmed');assert.ok(f.value.endsWith(' '+unit));assert.equal(f.correction.unitOrigin,'human_selection');resolveEvidence(next,f.correction.evidence);}
    assert.equal(next.documents[0].checks.find(c=>c.id==='bol_weight_arithmetic').unit,unit);
    assert.ok(!reviewQueue(next).some(item=>weights.includes(item.key)));assert.equal(measurementReviewProposal(next.documents[0]),null);
    const saved=savedReadingReview(next),restored=restoreConfirmedReading(read(),saved);
    for(const key of weights)assert.equal(restored.documents[0].fields[key].value,next.documents[0].fields[key].value);
    assert.ok(exportCorrections(next).every(c=>c.confirmationMethod==='measurement_group'&&!c.trainingEligible));
    assert.equal(next.documents[0].canAutoFile,false);
  }
});

test('group confirmation rejects missing consent, missing unit, stale or changed readings atomically',()=>{
  const r=read(),before=structuredClone(r),valid=request(r);
  for(const change of [{unit:''},{unit:'TON'},{userConfirmed:false},{documentId:'other'},{groupId:'other'},{expectedRevision:1},{expectedSignature:'old'}])assert.throws(()=>confirmMeasurementGroup(r,{...valid,...change}));
  assert.deepEqual(r,before);
  const corrected=confirmMeasurementGroup(r,valid);assert.throws(()=>confirmMeasurementGroup(corrected,valid));
});

test('saved readings use their existing OCR for the grouped review and retain unrelated confirmations',()=>{
  const r=read(),g=r.documents[0];
  for(const key of weights){delete g.fields[key].numberSupport;g.fields[key].issues=['invalid_weight','weight_unit_required','weak_recognition'];}
  g.fields.consignee={...g.fields.consignee,status:'confirmed',value:'REGIONAL MARKET',issues:[],correction:{value:'REGIONAL MARKET',confirmed:true,origin:'human'}};
  const sources=structuredClone(r.pages),oldConsignee=structuredClone(g.fields.consignee);
  const next=confirmMeasurementGroup(r,request(r));
  assert.deepEqual(next.pages,sources);assert.deepEqual(next.documents[0].fields.consignee,oldConsignee);
});
