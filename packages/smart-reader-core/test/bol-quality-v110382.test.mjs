import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,confirmField} from '../src/index.js';
import {savedReadingReview,confirmPageField,reviewQueue} from '../src/recovery.js';
import {restoreConfirmedReading} from '../src/continuity.js';
import {normalizeBolMeasurement,validateBolWeights} from '../src/bolMeasurements.js';
import {partyBlocksInput} from './party-blocks-fixture.mjs';
const line=(text,x,y,width=.18)=>({text,confidence:.96,box:{x,y,width,height:.014}});
function fixture({barcode='001234500',conflict=false}={}){
  const input=partyBlocksInput();
  const labels=[line('TOTAL UNITS:',.03,.84),line('331',.24,.84,.06),line('TOTAL TARE:',.03,.86),line('562.94',.24,.86,.08),
    line('TOTAL NET WEIGHT:',.49,.84,.20),line('3,373.90 PER',.71,.84,.17),line('TOTAL WEIGHT:',.49,.86,.20),line('3,936.84)',.71,.86,.14),
    line('Frozen Loads: Use temp setting of -10F',.03,.91,.6),line('carrier anc',.03,.07,.18)];
  labels.at(-1).box.height=.004;input.pages[0].observations[0].lines.push(...labels);
  if(conflict)input.pages[0].observations[1].lines.find(l=>l.text.startsWith('BOL#:')).text='BOL#: 00123450';
  if(barcode)input.pages[0].observations.push({id:'barcode',source:'barcode-code128',sourceImageId:'barcode-image',lines:[{text:barcode,confidence:null,box:{x:0,y:0,width:1,height:1}}]});
  return input;
}
function confirm(result,key,value){const group=result.documents[0],field=group.fields[key];return confirmField(result,{documentId:result.documentId,groupId:group.id,field:key,rawValue:value,userConfirmed:true,expectedRevision:result.reviewRevision,expectedRawValues:field.candidates.map(c=>c.rawValue),evidence:field.candidates[0].evidence[0]});}
const check=(result,id)=>result.documents[0].checks.find(c=>c.id===id);
test('BOL totals use their own labels, exclude adjacent PER and retain exact proof',()=>{
  const result=readDocument(fixture()),fields=result.documents[0].fields;
  for(const [key,value,quote] of [['weight','3936.84','3,936.84'],['netWeight','3373.90','3,373.90'],['tareWeight','562.94','562.94']]){
    assert.equal(fields[key].status,'needs_review');assert.equal(fields[key].value,null);
    assert.equal(fields[key].candidates[0].value,value);assert.equal(fields[key].candidates[0].unit,null);
    assert.ok(fields[key].issues.includes('weight_unit_required'));
    const evidence=fields[key].candidates[0].evidence[0];assert.equal(evidence.quote,quote);resolveEvidence(result,evidence);
    for(const label of fields[key].candidates[0].labelEvidence)resolveEvidence(result,label);
  }
  assert.equal(fields.totalUnits.candidates[0].value,'331');assert.equal(fields.temperature.value,'-10 F');
  assert.equal(fields.temperature.label,'Temperature setting instruction');
  assert.equal(check(result,'bol_weight_arithmetic').status,'passed');assert.equal(check(result,'bol_weight_arithmetic').unit,null);
  assert.equal(fields.carrier.value,'EXAMPLE TRANSPORT');assert.ok(!fields.carrier.candidates.some(c=>c.value==='anc'));
  assert.equal(result.documents[0].canAutoFile,false);
});
test('barcode corroborates exact digits without replacing OCR conflicts or inventing confidence',()=>{
  const result=readDocument(fixture({conflict:true})),field=result.documents[0].fields.bolNumber,comparison=check(result,'bol_barcode_comparison');
  assert.equal(field.status,'needs_review');assert.equal(field.value,null);assert.ok(field.issues.includes('conflicting_reads'));
  assert.deepEqual(new Set(field.candidates.map(c=>c.value)),new Set(['001234500','00123450']));
  assert.equal(comparison.status,'passed');assert.equal(comparison.value,'001234500');
  assert.equal(comparison.evidence.recognizerConfidence,null);resolveEvidence(result,comparison.evidence);
  assert.equal(result.documents[0].canAutoFile,false);
});
test('barcode differences enter the queue and recheck after confirmation and restoration',()=>{
  assert.ok(reviewQueue(readDocument(fixture({barcode:'009999999'}))).some(item=>item.key==='bolNumber'));
  const result=readDocument(fixture({conflict:true}));
  const wrong=confirm(result,'bolNumber','00123450');assert.equal(check(wrong,'bol_barcode_comparison').status,'needs_review');
  const corrected=confirm(wrong,'bolNumber','001234500');assert.equal(check(corrected,'bol_barcode_comparison').status,'passed');
  const restored=restoreConfirmedReading(result,savedReadingReview(wrong));assert.equal(check(restored,'bol_barcode_comparison').status,'needs_review');
  const manual=confirmPageField(result,{documentId:result.documentId,groupId:result.documents[0].id,field:'bolNumber',rawValue:'009999999',userConfirmed:true,expectedRevision:0,pageId:'page-1',sourceImageId:'image-0'});
  assert.equal(check(manual,'bol_barcode_comparison').status,'needs_review');
  const other=fixture();other.pages[0].observations.at(-1).source='existing-phone-ocr';assert.equal(check(readDocument(other),'bol_barcode_comparison'),undefined);
  other.pages[0].observations.at(-1).source='barcode-code128';delete other.pages[0].observations.at(-1).sourceImageId;delete other.pages[0].observations.at(-1).lines[0].box;
  assert.equal(check(readDocument(other),'bol_barcode_comparison'),undefined);
});
test('measurements retain sign and unit uncertainty, and use exact decimal arithmetic after corrections',()=>{
  assert.equal(normalizeBolMeasurement('temperature_instruction','<10F').issue,'ambiguous_temperature_sign');
  assert.equal(normalizeBolMeasurement('temperature_instruction','−10°F').value,'-10 F');
  assert.equal(normalizeBolMeasurement('shipping_weight','3,936.').value,null);
  assert.equal(normalizeBolMeasurement('shipping_weight','3,936.840 LBS').value,'3936.840 LB');
  let result=readDocument(fixture());assert.throws(()=>confirm(result,'weight','3936.84'),/ambiguous or invalid/);
  result=confirm(result,'weight','3936.85 LB');assert.equal(check(result,'bol_weight_arithmetic').status,'needs_review');
  result=confirm(result,'weight','3936.84 LB');assert.equal(check(result,'bol_weight_arithmetic').status,'passed');assert.equal(check(result,'bol_barcode_comparison').status,'passed');
  result=confirm(result,'netWeight','3373.90 KG');assert.equal(check(result,'bol_weight_arithmetic').status,'not_checked');
  const numeric=v=>({candidates:[normalizeBolMeasurement('shipping_weight',v)]});
  assert.equal(validateBolWeights({netWeight:numeric('0.1 LB'),tareWeight:numeric('0.2 LB'),weight:numeric('0.3 LB')})[0].status,'passed');
  const ambiguous=numeric('10 LB');ambiguous.candidates.push(normalizeBolMeasurement('shipping_weight','11 LB'));
  assert.equal(validateBolWeights({netWeight:ambiguous,tareWeight:numeric('2 LB'),weight:numeric('12 LB')})[0].status,'not_checked');
});
test('corroborated detached consignee noise keeps raw proof without a false conflict',()=>{
  const input=partyBlocksInput(),sparse=input.pages[0].observations[1];
  sparse.lines.find(l=>l.text==='REGIONAL MARKET').text='~~ REGIONAL MARKET';
  const result=readDocument(input),field=result.documents[0].fields.consignee;
  assert.ok(!field.issues.includes('conflicting_reads'));
  const raw=field.candidates.find(c=>c.rawValue.includes('~~'));assert.ok(raw);
  assert.equal(raw.value,'REGIONAL MARKET / TOWN DEPOT #1-2');resolveEvidence(result,raw.evidence[0]);
  sparse.lines.find(l=>l.text.startsWith('~~')).text='~~ REGIONAL MARKET 2';
  assert.ok(readDocument(input).documents[0].fields.consignee.issues.includes('conflicting_reads'));
});
