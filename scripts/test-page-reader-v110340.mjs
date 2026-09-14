import assert from 'node:assert/strict';
import {noisyPageInput} from '../packages/smart-reader-core/test/noisy-page-fixture.mjs';
import {reviewScanAnalysis} from '../source/src/modules/scan/ownedReaderAdapter.js';
import {extraPageIdentity} from '../source/src/modules/scan/ownedPageIdentityV110338.js';
import {finalizeSmartScanAnalysisV11039} from '../source/src/modules/scan/engines/isolatedDocumentRouterV10959.js';
const input=noisyPageInput(),dimensions={};
const passes=input.pages.flatMap((page,index)=>page.observations.map(o=>{
  dimensions[`page-${index+1}:${o.id}`]={width:1000,height:1000};
  return {id:o.id,page:index+1,text:o.lines.map(l=>l.text).join('\n'),lines:o.lines.map(l=>({text:l.text,confidence:l.confidence*100,left:l.box.x*1000,top:l.box.y*1000,width:l.box.width*1000,height:l.box.height*1000}))};
}));
const analysis={type:{id:'other'},pageCount:3,ocrEvidenceV110323:passes,fields:{total:185,loadNo:'STALE'},routing:{autoFile:true}};
const result=reviewScanAnalysis(analysis,{dimensions});
assert.deepEqual(result.documents.map(d=>d.kind),['bol','bol','unloading_receipt']);
assert.ok(result.documents.every(d=>d.identityStatus==='needs_review'));
const routed=finalizeSmartScanAnalysisV11039(analysis);
assert.equal(routed.routing.autoFile,false);assert.equal(routed.fields.total,undefined);assert.equal(routed.fields.loadNo,undefined);
const receipt=extraPageIdentity(passes.at(-1).text);
assert.equal(receipt.typeId,'lumper_receipt');assert.equal(receipt.requiresTypeReview,true);assert.ok(receipt.confidence<=.49);
console.log('PASS — noisy page types reach app review, preserve uncertainty and keep mixed filing fields empty');
