import assert from 'node:assert/strict';
import fs from 'node:fs';
import {needsReadingRetry,hasReadableBolReference,needsAmountSourceVerification} from '../packages/smart-reader-core/src/ocrRetry.js';
import {planPartyRegions} from '../packages/smart-reader-core/src/partyRetry.js';
import {reviewScanAnalysis} from '../source/src/modules/scan/ownedReaderAdapter.js';

const strip=path=>fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace('export async function','async function');
const makeDetails=new Function('deps',`const {planPartyRegions,decodeImageFileV3,imageDataToFileV3}=deps;${strip('source/src/modules/scan/partyDetailV110357.js')};return preparePartyDetails;`);
const makeReader=new Function('deps',`const {needsReadingRetry,hasReadableBolReference,needsAmountSourceVerification,prepareIdentifierDetail,preparePartyDetails,checkCancelled,monotonicProgress,qualifyDocumentFieldsV11038,recognizeDocumentText,decodeImageFileV3,imageDataToFileV3,grayscalePaperV110323,normalizePaperV110323,classifyDocument,arbitrateDocumentTypeV104,documentTypeMeta,parseSmartDocumentTextByTypeV104}=deps;${strip('source/src/modules/scan/imageReaderV110323.js')};return readImageDocumentV110323;`);
const clean={name:'clean',type:'image/png'},original={name:'original',type:'image/png'};
const pixels={width:1000,height:1000,data:new Uint8ClampedArray(4000000)};
for(let i=0;i<pixels.data.length;i++)pixels.data[i]=i%251;
const lines=(carrier,confidence)=>['BILL OF LADING','BOL#: 123456-001','Ship Date: 9/11/2026','Shipper: Example Mills LLC','TO: Example Receiver','Carrier: '+carrier]
  .map((text,i)=>({text,left:50,top:40+i*100,width:380,height:20,confidence:i===5?confidence:95}));
const resultFor=(rows,dimensions={width:1000,height:1000})=>({text:rows.map(line=>line.text).join('\n'),lines:rows,imageSize:dimensions,confidence:.95});
const checkCancelled=signal=>{if(signal?.aborted)throw new DOMException('Canceled','AbortError');};
let controller,reads,decodes,failCrop=false,abortCrop=false;
const preparePartyDetails=makeDetails({planPartyRegions,decodeImageFileV3:async file=>{
  assert.equal(file,clean,'crop pixels come from the exact weak pass');decodes++;
  if(abortCrop)controller.abort();return pixels;
},imageDataToFileV3:async(data,name)=>{
  // Crop must include the weak source line and preserve its pixels exactly.
  const box=planPartyRegions([resultFor(lines('TTA, QUALITY LOGISTICS',72)),resultFor(lines('TOTAL QUALITY LOGISTICS',96))].map((pass,i)=>({...pass,id:String(i)})))[0].region;
  assert.equal(data.width,box.width);assert.equal(data.height,box.height);
  assert.deepEqual([...data.data.slice(0,4)],[...pixels.data.slice((box.top*1000+box.left)*4,(box.top*1000+box.left)*4+4)]);
  return {name,type:'image/png',width:data.width,height:data.height};
}});
const reader=makeReader({needsReadingRetry,hasReadableBolReference,needsAmountSourceVerification,prepareIdentifierDetail:async()=>{throw new Error('No BOL retry expected');},preparePartyDetails,checkCancelled,monotonicProgress:()=>()=>{},qualifyDocumentFieldsV11038:()=>({fields:{bolNo:'123456-001',documentDate:'2026-09-11'}}),recognizeDocumentText:async(file,options)=>{
  assert.equal(options.signal,controller.signal);reads.push({file,options});
  if(file.name.includes('party-detail')){
    assert.equal(options.pageSegMode,'7');assert.equal(options.thresholdingMethod,'2');
    if(failCrop)throw new Error('crop OCR unavailable');
    return resultFor([{text:'Carrier: TOTAL QUALITY LOGISTICS',left:5,top:5,width:file.width-10,height:file.height-10,confidence:99}],{width:file.width,height:file.height});
  }
  return resultFor(lines(reads.length===1?'TTA, QUALITY LOGISTICS':'TOTAL QUALITY LOGISTICS',reads.length===1?72:96));
},decodeImageFileV3:async()=>pixels,imageDataToFileV3:async()=>clean,grayscalePaperV110323:x=>x,normalizePaperV110323:x=>x,classifyDocument:()=>({type:{id:'bol'}}),arbitrateDocumentTypeV104:()=>({type:{id:'bol'}}),documentTypeMeta:()=>({id:'other'}),parseSmartDocumentTextByTypeV104:()=>({})});
function reset(){controller=new AbortController();reads=[];decodes=0;}
reset();
const result=await reader(original,{signal:controller.signal});
assert.equal(reads.length,4,'three whole-page reads and one small party reread');assert.equal(decodes,1);
assert.equal(result.pageCount,1);assert.match(result.text,/BILL OF LADING/);
const crop=result.ocrEvidenceV110323.at(-1);
assert.equal(crop.scope,'region');assert.equal(crop.sourcePassId,'1-clean-page');assert.equal(crop.fieldLabel,'Carrier');
const dimensions=Object.fromEntries(result.ocrEvidenceV110323.map(pass=>[`page-1:${pass.id}`,pass.imageSize]));
const review=reviewScanAnalysis(result,{dimensions}),carrier=review.documents[0].fields.carrier;
assert.equal(carrier.status,'needs_review');assert.ok(carrier.issues.includes('conflicting_reads'));
assert.equal(carrier.candidates.length,2);assert.equal(review.documents[0].canAutoFile,false);
assert.equal(carrier.candidates.find(c=>c.value==='TOTAL QUALITY LOGISTICS').evidence.at(-1).sourceImageId,`scan-review:page-1:${crop.id}`,'crop coordinates refer only to the crop image');
reset();failCrop=true;
const failed=await reader(original,{signal:controller.signal});
assert.equal(reads.length,4);assert.equal(failed.ocrEvidenceV110323.length,3);assert.equal(failed.pageReadingV110328.readable,1);
assert.ok(failed.ocrFailuresV110323.some(f=>f.pass==='party-detail-1'&&f.code==='ocr_failed'));
reset();failCrop=false;abortCrop=true;
await assert.rejects(()=>reader(original,{signal:controller.signal}),{name:'AbortError'});
assert.equal(reads.length,3,'cancellation during crop preparation starts no further OCR');
const mismatched=makeDetails({planPartyRegions,decodeImageFileV3:async()=>({...pixels,width:999}),imageDataToFileV3:async()=>{throw new Error('Mismatched image must not be cropped');}});
assert.deepEqual(await mismatched(result.ocrEvidenceV110323,()=>{}),[]);
console.log('PASS — bounded party rereads, exact crop pixels, retained conflicts, crop failure and cancellation');
