import assert from 'node:assert/strict';
import {mixedPacketInput} from '../packages/smart-reader-core/test/mixed-packet-fixture.mjs';
import {readDocument} from '../packages/smart-reader-core/src/index.js';
import {inspectPageIdentity} from '../source/src/modules/scan/documentIdentityV110334.js';
import {finalizeSmartScanAnalysisV11039,reanalyzeTruckDocumentTypeIsolatedV10959} from '../source/src/modules/scan/engines/isolatedDocumentRouterV10959.js';
import {qualifyScanResultV11036} from '../source/src/modules/scan/DocumentEvidenceV11036.js';

const input=mixedPacketInput();
const passes=input.pages.map((page,index)=>{
  const lines=page.observations[0].lines;
  return {id:'page-'+(index+1),page:index+1,text:lines.map(l=>l.text).join('\n'),confidence:.9,lines:lines.map(l=>({text:l.text,confidence:l.confidence*100,left:l.box.x*1000,top:l.box.y*1000,width:l.box.width*1000,height:l.box.height*1000}))};
});
assert.equal(inspectPageIdentity(passes[1].text).typeId,'bol');
assert.equal(inspectPageIdentity(passes[2].text).typeId,'lumper_receipt');
const generic={type:{id:'lumper_receipt'},pageCount:3,text:passes.map(p=>`[[PAGE:${p.page}]]\n${p.text}`).join('\n'),ocrEvidenceV110323:passes,
  fields:{total:185,gross:185,loadNo:'OLD-1',carrierName:'Wrong merged carrier'},fieldEvidence:{gross:{value:185}},routing:{autoFile:true}};
const snapshot=JSON.stringify(generic);
const routed=finalizeSmartScanAnalysisV11039(generic);
for(const result of [routed,qualifyScanResultV11036(routed,{}),qualifyScanResultV11036(reanalyzeTruckDocumentTypeIsolatedV10959(routed,'lumper_receipt',{}),{})]){
  assert.equal(result.typeEvidenceV110334.mixedDocuments,true);
  for(const key of ['total','gross','loadNo','carrierName'])assert.ok(!result.fields[key],key+' must not span separate documents');
  assert.deepEqual(result.fieldEvidence,{});assert.deepEqual(result.evidenceReviewV11036.evidence,{});
  assert.equal(result.routing.autoFile,false);assert.equal(result.pageCount,3);assert.equal(result.ocrEvidenceV110323.length,3);
}
assert.equal(JSON.stringify(generic),snapshot);
const receipt=readDocument(input).documents[2];assert.equal(receipt.kind,'unloading_receipt');assert.equal(receipt.checks[0].status,'passed');
console.log('PASS — mixed scan retains three pages and per-document receipt amounts without packet-wide payment guesses');
