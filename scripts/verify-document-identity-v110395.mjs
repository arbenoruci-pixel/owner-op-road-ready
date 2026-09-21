import assert from 'node:assert/strict';
import fs from 'node:fs';
import {identityPacketInput} from '../packages/smart-reader-core/test/document-identity-fixture.mjs';
import {reviewScanAnalysis} from '../source/src/modules/scan/ownedReaderAdapter.js';
import {decideDocumentIdentity,inspectPageIdentity} from '../source/src/modules/scan/documentIdentityV110334.js';
import {resolveEvidence} from '../packages/smart-reader-core/src/index.js';

// Replay independent, anonymized OCR observations through the production
// adapter and filing classifier. This tests integration, not image OCR.
const input=identityPacketInput(),dimensions={},passes=input.pages.flatMap((page,i)=>page.observations.map(o=>{
  const id=(i+1)+'-'+o.id,imageSize={width:1800,height:2400};dimensions[`page-${i+1}:${id}`]=imageSize;
  return {id,page:i+1,imageSize,confidence:.96,text:o.lines.map(l=>l.text).join('\n'),
    lines:o.lines.map(l=>({text:l.text,confidence:l.confidence*100,left:l.box.x*1800,top:l.box.y*2400,width:l.box.width*1800,height:l.box.height*2400}))};
}));
const analysis={type:{id:'other'},pageCount:5,ocrEvidenceV110323:passes,
  pages:input.pages.map((p,i)=>({page:i+1,text:p.observations[0].lines.map(l=>l.text).join('\n')})),
  text:input.pages.map((p,i)=>`[[PAGE:${i+1}]]\n`+p.observations[0].lines.map(l=>l.text).join('\n')).join('\n'),
  fields:{},routing:{autoFile:false}};
const before=JSON.stringify(analysis),result=reviewScanAnalysis(analysis,{documentId:input.documentId,dimensions});
assert.equal(result.engineVersion,'0.3.29');
assert.deepEqual(result.documents.map(d=>d.kind),['bol','packing_list','packing_list','packing_list','bol']);
assert.deepEqual(result.documents.map(d=>d.identityStatus),['supported','supported','supported','supported','needs_review']);
for(const doc of result.documents.slice(1,4)){
  assert.equal(doc.fields.packingSlipNumber.value,'700012345');assert.equal(doc.fields.orderNumber.value,'0012345');
  assert.equal(doc.fields.poNumber.value,'902468');assert.equal(doc.fields.loadNumber.value,null);
  assert.equal(doc.fields.bolNumber.value,null);assert.equal(doc.canAutoFile,false);
}
const decision=decideDocumentIdentity(analysis);
assert.deepEqual(decision.pageTypes.map(p=>p.typeId),['bol','packing_list','packing_list','packing_list','bol']);
assert.equal(decision.mixedDocuments,true);assert.equal(decision.clearShipmentFields,true);assert.equal(decision.requiresTypeReview,true);
assert.equal(decision.pageTypes[4].requiresTypeReview,true);
assert.equal(inspectPageIdentity('RECEIPT # R-502\nLOAD DETAILS\nLoad Description: Breakdown pallets\nRELAY PAYMENT DETAILS\nAmount $388.00\nCheckout Fee $10.00\nNET TOTAL $398.00').typeId,'lumper_receipt');
for(const page of result.pageIdentities)for(const vote of page.evidence)for(const e of [vote.evidence,...vote.supportingEvidence])resolveEvidence(result,e);
for(const doc of result.documents)for(const field of Object.values(doc.fields))for(const c of field.candidates)
  for(const e of [...c.evidence,...(c.labelEvidence||[])])resolveEvidence(result,e);
assert.equal(JSON.stringify(analysis),before);
const meta=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
assert.equal(meta.version,'110.3.95');assert.equal(meta.build,'v110395-document-identity');
console.log('PASS — five-page document classification, distinct packing/order/PO references, filing boundaries, immutable source evidence and 110.3.95 release');
