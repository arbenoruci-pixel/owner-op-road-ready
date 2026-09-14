import assert from 'node:assert/strict';
import fs from 'node:fs';
import {needsReadingRetry,hasReadableBolReference,needsAmountSourceVerification} from '../packages/smart-reader-core/src/ocrRetry.js';
import {reviewScanAnalysis} from '../source/src/modules/scan/ownedReaderAdapter.js';

const source=fs.readFileSync('source/src/modules/scan/imageReaderV110323.js','utf8').replace(/^import .*;\n/gm,'').replace('export async function readImageDocumentV110323','async function readImageDocumentV110323');
const factory=new Function('deps',`const {needsReadingRetry,hasReadableBolReference,needsAmountSourceVerification,prepareIdentifierDetail,checkCancelled,monotonicProgress,qualifyDocumentFieldsV11038,recognizeDocumentText,decodeImageFileV3,imageDataToFileV3,grayscalePaperV110323,normalizePaperV110323,classifyDocument,arbitrateDocumentTypeV104,documentTypeMeta,parseSmartDocumentTextByTypeV104}=deps;${source};return readImageDocumentV110323;`);
const original={type:'image/png',name:'source'},clean={type:'image/png',name:'clean'},calls=[];
const receipt=total=>['RECEIPT # R-349','LOAD DETAILS','LOAD DESCRIPTION: UNLOADING','RELAY PAYMENT DETAILS','Carrier: Example Transport','Amount $240.00','Checkout Fee $7.00',`NET TOTAL $${total}.00`].join('\n');
const controller=new AbortController();
let abortOriginal=false;
const read=factory({needsReadingRetry,hasReadableBolReference,needsAmountSourceVerification,prepareIdentifierDetail:async()=>{throw new Error('no BOL detail expected');},checkCancelled:signal=>{if(signal?.aborted)throw new DOMException('Canceled','AbortError');},monotonicProgress:()=>()=>{},qualifyDocumentFieldsV11038:()=>({fields:{}}),recognizeDocumentText:async(file,options)=>{
  assert.equal(options.signal,controller.signal);calls.push({file,options});
  if(abortOriginal&&file===original){controller.abort();throw new Error('interrupted');}
  return {text:receipt(file===original?247:147),confidence:file===original?.95:.99};
},decodeImageFileV3:async()=>({}),imageDataToFileV3:async()=>clean,grayscalePaperV110323:x=>x,normalizePaperV110323:x=>x,classifyDocument:()=>({type:{id:'unloading_receipt'}}),arbitrateDocumentTypeV104:()=>({type:{id:'unloading_receipt'}}),documentTypeMeta:()=>({id:'other'}),parseSmartDocumentTextByTypeV104:()=>({})});
const result=await read(original,{signal:controller.signal});
assert.equal(calls.length,3,'two clean attempts and one original attempt stay bounded');
assert.equal(calls[2].file,original);assert.equal(calls[2].options.pageSegMode,'3','preserve whole lines in the original financial read');
assert.equal(result.pageCount,1);assert.match(result.text,/TOTAL \$247\.00/,'an arithmetically broken clean pass cannot outrank a complete original pass');
assert.equal(result.ocrEvidenceV110323[0].sourceImageFile,clean);assert.equal(result.ocrEvidenceV110323[2].sourceImageFile,original);
const review=reviewScanAnalysis(result),fields=review.documents[0].fields;
assert.equal(fields.amount.value,'240.00');assert.equal(fields.fee.value,'7.00');
assert.equal(fields.total.value,null);assert.ok(fields.total.issues.includes('conflicting_reads'));
assert.deepEqual(fields.total.candidates.map(c=>c.value),['147.00','247.00']);
assert.equal(review.pageCount,1);assert.equal(review.documents[0].canAutoFile,false);
abortOriginal=true;
await assert.rejects(()=>read(original,{signal:controller.signal}),{name:'AbortError'});
assert.equal(calls.length,6,'canceling original verification starts no extra work');
console.log('PASS — financial original-pixel verification, bounded passes, best-page selection, retained conflicts and cancellation');
