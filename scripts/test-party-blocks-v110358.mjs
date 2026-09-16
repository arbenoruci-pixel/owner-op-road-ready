import assert from 'node:assert/strict';
import fs from 'node:fs';
import {needsReadingRetry,hasReadableBolReference,needsAmountSourceVerification} from '../packages/smart-reader-core/src/ocrRetry.js';
import {planPartyRegions} from '../packages/smart-reader-core/src/partyRetry.js';
import {partyBlockPasses} from '../packages/smart-reader-core/test/party-blocks-fixture.mjs';
import {reviewScanAnalysis} from '../source/src/modules/scan/ownedReaderAdapter.js';

const strip=path=>fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace('export async function','async function');
const makeDetails=new Function('deps',`const {planPartyRegions,decodeImageFileV3,imageDataToFileV3}=deps;${strip('source/src/modules/scan/partyDetailV110357.js')};return preparePartyDetails;`);
const makeReader=new Function('deps',`const {needsReadingRetry,hasReadableBolReference,needsAmountSourceVerification,prepareIdentifierDetail,preparePartyDetails,checkCancelled,monotonicProgress,qualifyDocumentFieldsV11038,recognizeDocumentText,decodeImageFileV3,imageDataToFileV3,grayscalePaperV110323,normalizePaperV110323,classifyDocument,arbitrateDocumentTypeV104,documentTypeMeta,parseSmartDocumentTextByTypeV104}=deps;${strip('source/src/modules/scan/imageReaderV110323.js')};return readImageDocumentV110323;`);
const original={name:'original',type:'image/png'},clean={name:'clean',type:'image/png'},passes=partyBlockPasses();
const pixels={width:1000,height:1000,data:new Uint8ClampedArray(4000000)},calls=[];
let controller=new AbortController(),abortAfterFirst=false;
const checkCancelled=signal=>{if(signal?.aborted)throw new DOMException('Canceled','AbortError');};
const preparePartyDetails=makeDetails({planPartyRegions,decodeImageFileV3:async file=>{
  assert.ok(file===original||file===clean);return pixels;
},imageDataToFileV3:async(data,name)=>({name,type:'image/png',width:data.width,height:data.height})});
const read=makeReader({needsReadingRetry,hasReadableBolReference,needsAmountSourceVerification,prepareIdentifierDetail:async()=>{throw new Error('No identifier retry expected');},preparePartyDetails,checkCancelled,monotonicProgress:()=>()=>{},qualifyDocumentFieldsV11038:()=>({fields:{bolNo:'001234500',documentDate:'2026-07-14'}}),recognizeDocumentText:async(file,options)=>{
  calls.push({file,options});assert.equal(options.signal,controller.signal);
  if(!file.name.includes('party-detail'))return passes[Math.min(calls.length-1,2)];
  const block=options.pageSegMode==='6';
  if(abortAfterFirst){controller.abort();throw new Error('Canceled crop');}
  assert.ok(block||options.pageSegMode==='7');
  const texts=block?['CONSIGNED REGIONAL MARKET','TO: TOWN DEPOT #1-2']:['FROM: NORTHERN FOODS'];
  const rows=texts.map((text,i)=>({text,left:2,top:2+i*file.height*.45,width:file.width-4,height:block?file.height*.3:file.height-4,confidence:98}));
  return {text:texts.join('\n'),lines:rows,imageSize:{width:file.width,height:file.height},confidence:.98};
},decodeImageFileV3:async()=>pixels,imageDataToFileV3:async()=>clean,grayscalePaperV110323:x=>x,normalizePaperV110323:x=>x,classifyDocument:()=>({type:{id:'bol'}}),arbitrateDocumentTypeV104:()=>({type:{id:'bol'}}),documentTypeMeta:()=>({id:'other'}),parseSmartDocumentTextByTypeV104:()=>({})});
const result=await read(original,{signal:controller.signal});
assert.equal(calls.length,5);assert.equal(result.pageCount,1);
const crops=result.ocrEvidenceV110323.filter(pass=>pass.scope==='region');
assert.deepEqual(crops.map(pass=>pass.fieldLabel).sort(),['Consignee','Shipper']);
assert.deepEqual(calls.slice(3).map(call=>call.options.pageSegMode).sort(),['6','7']);
const dimensions=Object.fromEntries(result.ocrEvidenceV110323.map(pass=>[`page-1:${pass.id}`,pass.imageSize]));
const review=reviewScanAnalysis(result,{dimensions}),fields=review.documents[0].fields;
assert.equal(fields.shipper.status,'supported');assert.equal(fields.shipper.value,'NORTHERN FOODS');
assert.equal(fields.consignee.status,'needs_review');assert.equal(fields.consignee.candidates.length,1);
assert.equal(fields.consignee.candidates[0].value,'REGIONAL MARKET / TOWN DEPOT #1-2');
assert.equal(fields.consignee.issues.includes('conflicting_reads'),false);
assert.equal(fields.carrier.value,'EXAMPLE TRANSPORT');assert.equal(review.documents[0].canAutoFile,false);
assert.match(result.text,/BILL OF LADING/,'small crops never replace the page text');
calls.length=0;controller=new AbortController();abortAfterFirst=true;
await assert.rejects(()=>read(original,{signal:controller.signal}),{name:'AbortError'});
assert.equal(calls.length,4,'canceling the first crop prevents the second OCR request');
console.log('PASS — labeled party crops, wrapped block OCR mode, retained evidence and cancellation');
