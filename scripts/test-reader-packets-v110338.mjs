import assert from 'node:assert/strict';
import {mixedPacketInput} from '../packages/smart-reader-core/test/mixed-packet-fixture.mjs';
import {readDocument} from '../packages/smart-reader-core/src/index.js';
import {inspectPageIdentity,decideDocumentIdentity} from '../source/src/modules/scan/documentIdentityV110334.js';
import {finalizeSmartScanAnalysisV11039,reanalyzeTruckDocumentTypeIsolatedV10959} from '../source/src/modules/scan/engines/isolatedDocumentRouterV10959.js';
import {qualifyScanResultV11036} from '../source/src/modules/scan/DocumentEvidenceV11036.js';

const input=mixedPacketInput();
const passes=input.pages.map((page,index)=>{
  const lines=page.observations[0].lines;
  return {id:'page-'+(index+1),page:index+1,text:lines.map(l=>l.text).join('\n'),confidence:.9,lines:lines.map(l=>({text:l.text,confidence:l.confidence*100,left:l.box.x*1000,top:l.box.y*1000,width:l.box.width*1000,height:l.box.height*1000}))};
});
assert.equal(inspectPageIdentity(passes[1].text).typeId,'bol');
assert.equal(inspectPageIdentity(passes[1].text).requiresTypeReview,true);
const structural={type:{id:'other'},pageCount:1,text:passes[1].text,ocrEvidenceV110323:[{...passes[1],page:1}]};
for(const result of [decideDocumentIdentity(structural),finalizeSmartScanAnalysisV11039(structural).typeEvidenceV110334]){
  assert.equal(result.typeId,'bol');assert.equal(result.requiresTypeReview,true);assert.ok(result.confidence<=.49);
}
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

const bol=['BILL OF LADING','Ship From: Example Origin','Ship To: Example Destination','Weight: 1200 LB'];
function sameTypePacket(reference,{weak=false,secondCompany='Example Origin'}={}){
  const evidence=[1,2].map(page=>{
    const rows=[...bol,...(reference?[`BOL No: ${reference}`]:[])].map(text=>page===2?text.replace('Example Origin',secondCompany):text);
    return {id:'same-'+page,page,text:rows.join('\n'),confidence:.96,lines:rows.map(text=>({text,confidence:weak&&text.startsWith('BOL No:')?25:96}))};
  });
  return {type:{id:'bol'},pageCount:2,text:evidence.map(pass=>`[[PAGE:${pass.page}]]\n${pass.text}`).join('\n'),ocrEvidenceV110323:evidence,fields:{total:185,gross:185,loadNo:'OLD-1'}};
}
for(const packet of [sameTypePacket(),sameTypePacket('B-17',{weak:true}),sameTypePacket('B-17',{secondCompany:'Another Company'})]){
  const routed=finalizeSmartScanAnalysisV11039(packet);
  for(const result of [routed,qualifyScanResultV11036(routed,{}),qualifyScanResultV11036(reanalyzeTruckDocumentTypeIsolatedV10959(routed,'bol',{}),{})]){
    assert.equal(result.typeEvidenceV110334.mixedDocuments,true);
    assert.equal(result.typeEvidenceV110334.requiresTypeReview,true);
    assert.equal(result.fields.total,undefined);assert.equal(result.fields.gross,undefined);assert.equal(result.fields.loadNo,undefined);
    assert.deepEqual(result.evidenceReviewV11036.evidence,{});assert.equal(result.pageCount,2);
  }
}
assert.ok(!finalizeSmartScanAnalysisV11039(sameTypePacket('B-17')).packetReviewV110338,'a supported shared ID with agreeing parties remains a continuation');
console.log('PASS — mixed scan retains three pages and per-document receipt amounts without packet-wide payment guesses');
