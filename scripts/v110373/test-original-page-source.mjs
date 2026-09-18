import {retainedReviewPageSources} from '../../source/src/modules/scan/readerPageSourcesV110373.js';
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
assert.equal(unbound.pages[1].observations[0].sourceImageId,originalId,'unpositioned OCR text can open its same-page retained original for manual review');
assert.ok(unbound.pages[1].observations[0].lines.every(l=>!l.box));
const bound=inputFromScanAnalysis(ocr,{documentId,originalSources:{'page-2':originalId},dimensions:{'page-2:variant':{width:200,height:200}}});
assert.equal(bound.pages[1].observations[0].sourceImageId,documentId+':page-2:variant');
assert.deepEqual(bound.pages[1].observations[0].lines[0].box,{x:.05,y:.05,width:.5,height:.06});
console.log('PASS — sparse original source identity, page isolation, absent/cross-document guards, immutable input and exact OCR geometry');

const processed=new Blob(['ocr derivative']),photo=new Blob(['perspective corrected']),second=new Blob(['second page']);
const photoAnalysis={scanMeta:{pageFiles:[processed,second],captureAssets:[{pageIndex:0,kind:'perspective-corrected',file:photo}]}};
const choices=retainedReviewPageSources(photoAnalysis);
assert.equal(choices[0].file,photo,'the retained perspective-corrected page wins over its OCR derivative');
assert.equal(choices[1].file,second,'a neighbouring page never borrows another original');
assert.equal(photoAnalysis.scanMeta.pageFiles[0],processed,'choosing sources does not replace scan input files');
assert.equal(retainedReviewPageSources({scanMeta:{pageFiles:[processed]}})[0].file,processed,'PDF page or derivative fallback is retained when no corrected asset exists');
assert.equal(retainedReviewPageSources({scanMeta:{pageFiles:[processed],captureAssets:[{pageIndex:0,kind:'perspective-corrected',file:'missing'}]}})[0].file,processed);
assert.equal(retainedReviewPageSources({scanMeta:{pageFiles:[processed],captureAssets:[{kind:'perspective-corrected',file:photo},{pageIndex:-1,kind:'perspective-corrected',file:photo},{pageIndex:0,kind:'ocr',file:photo}]}})[0].file,processed,'invalid page indices and different asset types cannot substitute');
assert.deepEqual(retainedReviewPageSources({scanMeta:{captureAssets:[{pageIndex:1,kind:'perspective-corrected',file:second}]}}),[{pageNumber:2,file:second}],'asset-only sparse pages retain their explicit index');
assert.deepEqual(retainedReviewPageSources(null),[]);
console.log('PASS — retained photo originals take priority, with per-page fallback and unchanged OCR derivatives');

const photographed=reviewScanAnalysis(ocr,{documentId,originalSources:{'page-2':originalId}});
for(const evidence of photographed.documents.find(d=>d.kind==='signature_page').fields.documentReference.candidates[0].evidence){
 assert.equal(evidence.sourceImageId,originalId);assert.equal(evidence.box,null);assert.equal(evidence.source,'existing-phone-ocr');
 resolveEvidence(photographed,evidence);
}
const mixed={...ocr,ocrEvidenceV110323:[...ocr.ocrEvidenceV110323,{...ocr.ocrEvidenceV110323[0],id:'unpositioned-retry'}]};
const mixedInput=inputFromScanAnalysis(mixed,{documentId,originalSources:{'page-2':originalId},dimensions:{'page-2:variant':{width:200,height:200}}});
assert.equal(mixedInput.pages[1].observations[0].sourceImageId,documentId+':page-2:variant');
assert.ok(mixedInput.pages[1].observations[0].lines[0].box);
assert.equal(mixedInput.pages[1].observations[1].sourceImageId,originalId);
assert.ok(mixedInput.pages[1].observations[1].lines.every(line=>!line.box));
assert.equal(inputFromScanAnalysis(ocr,{documentId,originalSources:{'page-2':'other:page-2:original'}}).pages[1].observations[0].sourceImageId,undefined);
console.log('PASS — populated photographed OCR observations open their retained page without inherited coordinates; mixed exact-image sources stay distinct');
