import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';
import {planBolMeasurementRegions} from '../src/measurementRetry.js';
const row=(text,x,y,width=.2,height=.01,confidence=.96)=>({text,confidence,box:{x,y,width,height}});
const obs=(id,lines)=>({id,sourceImageId:'image-'+id,source:'existing-phone-ocr',lines});
const input=observations=>({documentId:'row-recovery',pages:[{id:'page',observations:[obs('identity',[
  row('BILL OF LADING',.1,.02,.5),row('SHIPPER: EXAMPLE FOODS',.03,.2,.4),row('CONSIGNEE: REGIONAL MARKET',.03,.3,.4)
]),...observations]}]});
const fields=v=>readDocument(v).documents[0].fields;

test('tall overlapping weight boxes cannot become net or gross; complete row evidence stays exact',()=>{
  const v=input([obs('clean',[
    row('1111.50 PER',.72,.828,.11,.034,.82),row('TOTAL NET WEIGHT:',.49,.836,.15),
    row('TOTAL WEIGHT:',.49,.850,.12),row('2,500.',.72,.851,.045),
    row('TOTAL UNITS:',.03,.839,.11),row('321',.22,.838,.022)
  ]),obs('source',[
    row('TOTAL NET WEIGHT:',.49,.836,.15),row('2,000.25 PER',.72,.835,.11,.013),
    row('TOTAL WEIGHT:',.49,.850,.12),row('2,500.75f',.72,.851,.06),
    row('OTAL UNITS:',.03,.839,.11),row('321',.22,.838,.022),row('TOTAL TARE: 500.50',.03,.86,.3)
  ]),obs('detail',[row('TOTAL WEIGHT: 2,500.75]',.01,.1,.96,.5)])]);
  const result=readDocument(v),f=result.documents[0].fields;
  assert.ok(!f.weight.candidates.some(c=>c.numericValue==='1111.50'));
  assert.ok(!f.netWeight.candidates.some(c=>c.numericValue==='1111.50'));
  assert.deepEqual(f.netWeight.candidates.map(c=>c.numericValue),['2000.25']);
  assert.ok(f.weight.candidates.some(c=>c.numericValue==='2500.75'));
  assert.equal(f.weight.value,null);assert.ok(f.weight.issues.includes('weight_unit_required'));
  assert.equal(f.totalUnits.status,'supported');assert.equal(f.totalUnits.value,'321');
  assert.equal(result.documents[0].checks.find(c=>c.id==='bol_weight_arithmetic').status,'passed');
  for(const field of Object.values(f))for(const c of field.candidates)for(const e of [...c.evidence,...(c.labelEvidence||[])])resolveEvidence(result,e);
});
test('only matching, strong date evidence corroborates a truncated seconds suffix',()=>{
  const v=input([obs('cut',[row('DATE: 08/19/2026 07:41:',.7,.12,.25)]),obs('complete',[row('DATE: 08/19/2026 07:41:00',.7,.12,.25)])]);
  assert.equal(fields(v).documentDate.value,'2026-08-19');
  assert.equal(fields(v).documentDate.candidates[0].rawValue,'08/19/2026 07:41:');
  for(const text of ['08/19/2026 99:41:','08/19/2026 07:99:','08/19/2026 07:41:99','08/19/2026 07:41.00','08/20/2026 07:41:']){
    const bad=structuredClone(v);bad.pages[0].observations[1].lines[0].text='DATE: '+text;
    assert.equal(fields(bad).documentDate.value,null,text);
  }
  const weak=structuredClone(v);weak.pages[0].observations[2].lines[0].confidence=.6;
  assert.equal(fields(weak).documentDate.value,null);
  v.pages[0].observations.pop();assert.equal(fields(v).documentDate.value,null);
});
test('carrier initial spacing needs two strong direct readings and never merges identifiers or other names',()=>{
  const v=input([obs('clean',[row('CARRIER: X AND Y TRANSPORT #1-2',.03,.18,.45)]),
    obs('sparse',[row('CARRIER:',.03,.18,.08),row('XAND Y TRANSPORT #1-2',.16,.18,.32)]),
    obs('detail',[row('CARRIER: X AND Y TRANSPORT #1-2',.01,.1,.98,.5)])]);
  const result=readDocument(v),f=result.documents[0].fields.carrier;
  assert.equal(f.value,'X AND Y TRANSPORT #1-2');
  const recovered=f.candidates.find(c=>c.rawValue.startsWith('XAND'));assert.ok(recovered);
  resolveEvidence(result,recovered.evidence[0]);
  for(const change of [w=>w.pages[0].observations.pop(),w=>{w.pages[0].observations[2].lines[1].text='XAND Y TRANSPORT #12';},w=>{w.pages[0].observations[3].lines[0].confidence=.7;}]){
    const bad=structuredClone(v);change(bad);assert.equal(fields(bad).carrier.value,null);
  }
});
test('a damaged BIL label can agree with an exact strong B/L reading but cannot hide changed digits',()=>{
  const v=input([obs('detail',[row("'BILNO.: 0012345000",0,0,.99,.7,.4)]),obs('full',[row('B/L NO: 0012345000',.7,.1,.28)])]);
  assert.equal(fields(v).bolNumber.value,'0012345000');
  v.pages[0].observations[1].lines[0].text="'BILNO.: 001234500";
  assert.ok(fields(v).bolNumber.issues.includes('conflicting_reads'));
});
function passes(lines){return [{id:'1-source-page',sourceImageFile:{},imageSize:{width:1000,height:1300},lines:lines.map(l=>({text:l.text,confidence:l.confidence*100,left:l.box.x*1000,top:l.box.y*1300,width:l.box.width*1000,height:l.box.height*1300}))}];}
test('an exact barcode corroborates weak labeled digits without fabricated confidence or overriding conflicts',()=>{
  const v=input([obs('weak',[row('B/L NO: 0012345000',.7,.1,.28,.01,.76)]),
    {...obs('barcode',[row('0012345000',0,0,1,1,null)]),source:'barcode-code128'}]);
  const result=readDocument(v),f=result.documents[0].fields.bolNumber;
  assert.equal(f.value,'0012345000');assert.equal(f.status,'supported');assert.equal(f.candidates[0].evidence[0].recognizerConfidence,.76);
  assert.equal(f.corroboration.evidence[0].recognizerConfidence,null);resolveEvidence(result,f.corroboration.evidence[0]);
  assert.equal(result.documents[0].canAutoFile,false);
  for(const change of [w=>{w.pages[0].observations[2].lines[0].text='0099999999';},w=>{w.pages[0].observations[2].source='existing-phone-ocr';},w=>w.pages[0].observations.push(obs('conflict',[row('B/L NO: 001234500',.7,.1,.28)])),w=>{w.pages[0].observations[1].lines[0].text='0012345000';}]){
    const bad=structuredClone(v);change(bad);assert.equal(fields(bad).bolNumber.value,null);
  }
});
test('measurement retries target incomplete numbers, preserve row bounds and skip unit-only uncertainty',()=>{
  const lines=[row('TOTAL WEIGHT:',.49,.85,.12),row('2,500.75f',.72,.85,.06),row('TOTAL NET WEIGHT:',.49,.835,.15),row('2,000.25',.72,.835,.08),row('TOTAL TARE: 500.50',.03,.85,.3)];
  const plan=planBolMeasurementRegions(passes(lines));assert.equal(plan.length,1);assert.equal(plan[0].field,'weight');
  assert.ok(plan[0].region.top>=(.835+.01)*1300);assert.ok(plan[0].region.width*plan[0].region.height<1000*1300*.04);
  lines[1].text='2,500.75';assert.deepEqual(planBolMeasurementRegions(passes(lines)),[]);
  lines[1].text='2,500.75f';lines[0].box.y=.2;lines[1].box.y=.2;assert.deepEqual(planBolMeasurementRegions(passes(lines)),[]);
});
