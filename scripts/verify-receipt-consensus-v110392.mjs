import assert from 'node:assert/strict';
import {receiptColumnsInput} from '../packages/smart-reader-core/test/receipt-columns-fixture.mjs';
import {reviewScanAnalysis} from '../source/src/modules/scan/ownedReaderAdapter.js';
import {decideDocumentIdentity} from '../source/src/modules/scan/documentIdentityV110334.js';

const input=receiptColumnsInput(),dimensions={};
const passes=input.pages[0].observations.map(observation=>{
  dimensions[`page-1:${observation.id}`]={width:1000,height:1000};
  return {id:observation.id,page:1,confidence:.96,text:observation.lines.map(line=>line.text).join('\n'),
    lines:observation.lines.map(line=>({text:line.text,confidence:line.confidence*100,left:line.box.x*1000,top:line.box.y*1000,width:line.box.width*1000,height:line.box.height*1000}))};
});
const analysis={type:{id:'other'},pageCount:1,text:passes[0].text,ocrEvidenceV110323:passes,fields:{},routing:{autoFile:false}};
const before=JSON.stringify(analysis),result=reviewScanAnalysis(analysis,{documentId:'receipt-app',dimensions}),doc=result.documents[0];
assert.equal(result.engineVersion,'0.3.32');
assert.equal(doc.kind,'unloading_receipt');
assert.equal(doc.fields.fee.value,'10.00');assert.equal(doc.fields.total.value,'398.00');
assert.equal(doc.fields.poNumber.value,'PO-51');assert.equal(doc.fields.trailerNumber.value,'T-700');
assert.equal(doc.checks[0].status,'passed');assert.equal(doc.canAutoFile,false);
const identity=decideDocumentIdentity(analysis);
assert.equal(identity.typeId,'lumper_receipt');assert.ok(!identity.mixedDocuments);
assert.equal(JSON.stringify(analysis),before,'Classification and source review remain read-only');
const changed=structuredClone(analysis);
changed.ocrEvidenceV110323[0].text=changed.ocrEvidenceV110323[0].text.replaceAll('RC-51','RC-99');
for(const line of changed.ocrEvidenceV110323[0].lines)line.text=line.text.replaceAll('RC-51','RC-99');
assert.equal(decideDocumentIdentity(changed).mixedDocuments,true,'Different receipt numbers keep the filing conflict');
const thirdRead=structuredClone(analysis);
thirdRead.ocrEvidenceV110323[2].text=thirdRead.ocrEvidenceV110323[2].text.replaceAll('RC-51','RC-99');
for(const line of thirdRead.ocrEvidenceV110323[2].lines)line.text=line.text.replaceAll('RC-51','RC-99');
assert.equal(decideDocumentIdentity(thirdRead).mixedDocuments,true,'A matching pair cannot hide a different third receipt number');
console.log('PASS — receipt adapter, filing type, fee columns, source preservation and conflicting references');
