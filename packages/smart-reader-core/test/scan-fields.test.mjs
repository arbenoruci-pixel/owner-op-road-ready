import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,confirmField} from '../src/index.js';
import {scanWithSourceFields} from '../src/scanFields.js';
import {confirmPageField} from '../src/recovery.js';
import {bolSourceInput} from './bol-source-fixture.mjs';
const warning='BOL number was not verified from its label. Check the original.';
function fixture(){
  const analysis={type:{id:'bol'},text:'Original OCR',fields:{bolNo:'WRONG',shipper:'Old shipper',origin:'Old shipper',carrierName:'Old guess',weight:'15022.42',weightUnit:'kg',loadNo:'DRIVER-FOLDER',references:[{kind:'bol_number',value:'WRONG'},{kind:'load_number',value:'DRIVER-FOLDER'}]},
    routing:{autoFile:false},evidenceReviewV11036:{issues:[warning,'Check the original weight unit.'],evidence:{bolNo:{value:'WRONG'}}}};
  return {analysis,review:{analysis,result:readDocument(bolSourceInput())}};
}
test('the main scan fields and warning follow source evidence while the original remains unchanged',()=>{
  const {analysis,review}=fixture(),before=JSON.stringify({analysis,review});
  const shown=scanWithSourceFields(analysis,review,'bol');
  for(const [key,value]of Object.entries({bolNo:'0012345678',shipper:'NORTHERN FOODS',consignee:'REGIONAL MARKET / TOWN DEPOT NORTH',carrierName:'J AND K TRANSPORT',trailerNo:'8042'}))assert.equal(shown.fields[key],value,key);
  assert.ok(!shown.evidenceReviewV11036.issues.includes(warning));assert.ok(shown.evidenceReviewV11036.issues.includes('Check the original weight unit.'));
  assert.equal(shown.fields.weight,undefined);assert.equal(shown.fields.weightUnit,undefined);assert.equal(shown.fields.origin,'NORTHERN FOODS');assert.equal(shown.fields.loadNo,'DRIVER-FOLDER');assert.equal(shown.routing.autoFile,false);assert.equal(shown.needsReview,true);
  assert.ok(!shown.fields.references.some(ref=>ref.value==='WRONG'));assert.ok(shown.fields.references.some(ref=>ref.kind==='load_number'&&ref.value==='DRIVER-FOLDER'));
  assert.equal(shown.fields.readerSourceFieldsV110393.fields.bolNo.status,'supported');
  assert.equal(JSON.stringify({analysis,review}),before);
});
test('stale, differently typed and mixed-page reviews cannot change filing fields',()=>{
  const {analysis,review}=fixture();
  assert.equal(scanWithSourceFields({...analysis},review,'bol').fields.bolNo,'WRONG');
  assert.equal(scanWithSourceFields(analysis,review,'pod'),analysis);
  review.result.documents.push(structuredClone(review.result.documents[0]));assert.equal(scanWithSourceFields(analysis,review,'bol'),analysis);
});
test('a conflicting reference clears the legacy guess instead of copying a candidate',()=>{
  const {analysis,review}=fixture(),input=bolSourceInput();
  const sparse=input.pages[0].observations.find(o=>o.id==='sparse'),other=structuredClone(sparse);other.id='conflict';other.sourceImageId='other-source';
  other.lines.find(l=>l.text.startsWith('NO.:')).text='NO.: 0099999999';input.pages[0].observations.push(other);review.result=readDocument(input);
  const shown=scanWithSourceFields(analysis,review,'bol');assert.equal(shown.fields.bolNo,undefined);assert.ok(shown.evidenceReviewV11036.issues.includes(warning));
});
test('an explicit correction is saved as human-confirmed with its original source proof',()=>{
  const {analysis,review}=fixture(),doc=review.result.documents[0],field=doc.fields.bolNumber;
  review.result=confirmField(review.result,{documentId:review.result.documentId,groupId:doc.id,field:'bolNumber',rawValue:'0012345679',evidence:field.candidates[0].evidence[0],userConfirmed:true,expectedRevision:0,expectedRawValues:field.candidates.map(c=>c.rawValue)});
  const shown=scanWithSourceFields(analysis,review,'bol');assert.equal(shown.fields.bolNo,'0012345679');
  assert.equal(shown.fieldEvidence.bolNo.source,'driver_confirmed');assert.equal(shown.fields.readerSourceFieldsV110393.fields.bolNo.evidence[0].quote,'0012345678');
});
test('source references that do not resolve cannot supply a filing value',()=>{
  const {analysis,review}=fixture();review.result.documents[0].fields.bolNumber.candidates[0].evidence[0].quote='NOT THE SOURCE';
  const shown=scanWithSourceFields(analysis,review,'bol');assert.equal(shown.fields.bolNo,undefined);assert.ok(shown.evidenceReviewV11036.issues.includes(warning));
});
test('a driver can fill a missing field from its page without inventing OCR evidence',()=>{
  const {analysis,review}=fixture(),doc=review.result.documents[0],page=review.result.pages[0];
  review.result=confirmPageField(review.result,{documentId:review.result.documentId,groupId:doc.id,field:'weight',rawValue:'15022.42 lb',pageId:page.id,
    sourceImageId:page.observations[0].sourceImageId,userConfirmed:true,expectedRevision:0});
  const shown=scanWithSourceFields(analysis,review,'bol');assert.equal(shown.fields.weight,'15022.42 LB');
  assert.equal(shown.fieldEvidence.weight.source,'driver_confirmed');assert.deepEqual(shown.fields.readerSourceFieldsV110393.fields.weight.evidence,[]);
  assert.equal(shown.fields.readerSourceFieldsV110393.fields.weight.sourcePage.pageId,page.id);
});
