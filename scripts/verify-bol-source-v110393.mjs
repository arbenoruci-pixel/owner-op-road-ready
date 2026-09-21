import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bolSourceInput} from '../packages/smart-reader-core/test/bol-source-fixture.mjs';
import {reviewScanAnalysis} from '../source/src/modules/scan/ownedReaderAdapter.js';
import {confirmField,resolveEvidence} from '../packages/smart-reader-core/src/index.js';
import {savedReadingReview} from '../packages/smart-reader-core/src/recovery.js';
import {scanWithSourceFields} from '../packages/smart-reader-core/src/scanFields.js';
import {compactRateConSaveFieldsV10964} from '../source/src/modules/scan/rateConSaveStabilityV10964.js';

const dimensions={},input=bolSourceInput();
const passes=input.pages[0].observations.map(o=>{
  const imageSize={width:1500,height:2000};dimensions[`page-1:${o.id}`]=imageSize;
  return {id:o.id,page:1,imageSize,confidence:.96,text:o.lines.map(l=>l.text).join('\n'),
    lines:o.lines.map(l=>({text:l.text,confidence:l.confidence*100,left:l.box.x*1500,top:l.box.y*2000,width:l.box.width*1500,height:l.box.height*2000}))};
});
const analysis={type:{id:'bol'},pageCount:1,text:passes[0].text,ocrEvidenceV110323:passes,fields:{},routing:{autoFile:false}};
const before=JSON.stringify(analysis),result=reviewScanAnalysis(analysis,{documentId:'bol-app-review',dimensions}),doc=result.documents[0];
assert.equal(result.engineVersion,'0.3.32');assert.equal(doc.reference,'0012345678');
for(const [key,value]of Object.entries({bolNumber:'0012345678',shipper:'NORTHERN FOODS',consignee:'REGIONAL MARKET / TOWN DEPOT NORTH',carrier:'J AND K TRANSPORT',trailerNumber:'8042',poNumber:'24681357',documentDate:'2026-07-14',temperature:'-10 F'})){
  assert.equal(doc.fields[key].value,value,key);assert.equal(doc.fields[key].status,'supported',key);
}
assert.equal(doc.fields.weight.value,null);assert.ok(doc.fields.weight.issues.includes('weight_unit_required'));
const evidence=doc.fields.bolNumber.candidates[0].evidence[0];resolveEvidence(result,evidence);
const confirmed=confirmField(result,{documentId:result.documentId,groupId:doc.id,field:'bolNumber',rawValue:'0012345678',evidence,userConfirmed:true,expectedRevision:result.reviewRevision,expectedRawValues:doc.fields.bolNumber.candidates.map(c=>c.rawValue)});
assert.equal(savedReadingReview(confirmed).documents[0].fields.bolNumber.value,'0012345678');
const shown=scanWithSourceFields(analysis,{analysis,result:confirmed},'bol');
assert.equal(shown.fields.bolNo,'0012345678');assert.equal(shown.fields.trailerNo,'8042');
assert.equal(shown.fields.readerSourceFieldsV110393.fields.bolNo.status,'confirmed');
assert.equal(compactRateConSaveFieldsV10964(shown.fields).bolNo,'0012345678');
const sheet=fs.readFileSync('source/src/modules/scan/SmartScanSheetV105.jsx','utf8');
for(const anchor of ['<ScanEvidenceReviewV11036 analysis={sourceAnalysisV110393} />','onReady={acceptReaderReviewV110345}',
  'extractedRows(sourceAnalysisV110393)','...(sourceAnalysisV110393?.fields || {})',
  'storageFieldsV10964.readerSourceFieldsV110393=sourceAnalysisV110393.fields.readerSourceFieldsV110393'])assert.ok(sheet.includes(anchor),anchor);
assert.equal(doc.canAutoFile,false);assert.equal(JSON.stringify(analysis),before);
console.log('PASS — BOL app adapter, eight supported fields, exact proof, review confirmation and unchanged source');
