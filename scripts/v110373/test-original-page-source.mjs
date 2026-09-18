import assert from 'node:assert/strict';
import {inputFromScanAnalysis,reviewScanAnalysis} from '../../source/src/modules/scan/ownedReaderAdapter.js';
import {resolveEvidence} from '../../packages/smart-reader-core/src/index.js';
const documentId='synthetic-original-review';
const text='SIGNATURE PAGE\nDocument Ref: SYNTHETIC-AB012';
const analysis={text:'[[PAGE:1]]\nUnreadable\n[[PAGE:2]]\n'+text,pageCount:2,pages:[{page:1,text:'Unreadable'},{page:2,text}]};
const originalId=documentId+':page-2:original',before=JSON.stringify(analysis);
const result=reviewScanAnalysis(analysis,{documentId,originalSources:{'page-2':originalId}});
const field=result.documents.find(d=>d.kind==='signature_page').fields.documentReference;
assert.equal(field.value,'SYNTHETIC-AB012');
for(const evidence of field.candidates[0].evidence){
 assert.equal(evidence.sourceImageId,originalId);assert.equal(evidence.box,null);
 assert.equal(resolveEvidence(result,evidence).observation.sourceImageId,originalId);
}
assert.equal(result.pages[0].observations[0].sourceImageId,null,'no image is borrowed from another page');
assert.equal(JSON.stringify(analysis),before,'binding leaves the scan input unchanged');
const wrong=reviewScanAnalysis(analysis,{documentId,originalSources:{'page-2':'different-document:page-2:original'}});
assert.equal(wrong.pages[1].observations[0].sourceImageId,null,'a different document identity cannot bind');
const unavailable=reviewScanAnalysis(analysis,{documentId});
assert.equal(unavailable.pages[1].observations[0].sourceImageId,null,'missing original stays unavailable');
const ocr={...analysis,ocrEvidenceV110323:[{id:'variant',page:2,text,source:'existing-phone-ocr',lines:[{text:'Document Ref: SYNTHETIC-AB012',left:10,top:10,width:100,height:12,confidence:99}]}]};
const unbound=inputFromScanAnalysis(ocr,{documentId,originalSources:{'page-2':originalId}});
assert.equal(unbound.pages[1].observations[0].sourceImageId,undefined,'unrelated original never binds a known OCR variant');
assert.ok(unbound.pages[1].observations[0].lines.every(l=>!l.box));
const bound=inputFromScanAnalysis(ocr,{documentId,originalSources:{'page-2':originalId},dimensions:{'page-2:variant':{width:200,height:200}}});
assert.equal(bound.pages[1].observations[0].sourceImageId,documentId+':page-2:variant');
assert.deepEqual(bound.pages[1].observations[0].lines[0].box,{x:.05,y:.05,width:.5,height:.06});
console.log('PASS — sparse original source identity, page isolation, absent/cross-document guards, immutable input and exact OCR geometry');
