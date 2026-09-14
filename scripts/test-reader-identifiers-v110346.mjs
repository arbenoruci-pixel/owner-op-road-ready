import fs from 'node:fs';
import assert from 'node:assert/strict';
import {needsReadingRetry,hasReadableBolReference} from '../packages/smart-reader-core/src/ocrRetry.js';
import {reviewScanAnalysis} from '../source/src/modules/scan/ownedReaderAdapter.js';

// Exercise the production decision to make its bounded fourth read even when
// an earlier page pass reports high overall confidence and a plausible suffix.
const source=fs.readFileSync('source/src/modules/scan/imageReaderV110323.js','utf8').replace(/^import .*;\n/gm,'').replace('export async function readImageDocumentV110323','async function readImageDocumentV110323');
const factory=new Function('deps',`const {needsReadingRetry,hasReadableBolReference,prepareIdentifierDetail,checkCancelled,monotonicProgress,qualifyDocumentFieldsV11038,recognizeDocumentText,decodeImageFileV3,imageDataToFileV3,grayscalePaperV110323,normalizePaperV110323,classifyDocument,arbitrateDocumentTypeV104,documentTypeMeta,parseSmartDocumentTextByTypeV104}=deps;${source};return readImageDocumentV110323;`);
const original={type:'image/png',name:'unchanged-source'},clean={type:'image/png'},detail={type:'image/png'},calls=[];
const base=['BILL OF LADING','SHIP FROM: Example Foods','SHIP TO: Example Market','BODY MUST SURVIVE'];
const line=(text,left,top,width)=>({text,left,top,width,height:12,confidence:96});
const pagePass=lines=>({text:[...base,...lines.map(l=>l.text)].join('\n'),confidence:.99,imageSize:{width:1000,height:1000},lines:[...base.map((text,i)=>line(text,30,20+i*20,300)),...lines]});
let planned=0;
const read=factory({needsReadingRetry,hasReadableBolReference,prepareIdentifierDetail:async passes=>{planned++;assert.equal(hasReadableBolReference(passes),false);return {file:detail,sourcePassId:passes[0].id,region:{left:680,top:90,width:300,height:40}};},checkCancelled:()=>{},monotonicProgress:()=>()=>{},qualifyDocumentFieldsV11038:()=>({fields:{}}),recognizeDocumentText:async(file,options)=>{
  calls.push({file,options});
  if(file===detail)return pagePass([line('BOL NO: 0047318642',700,100,200)]);
  if(file===original)return pagePass([line('0047318642',800,100,100)]);
  return pagePass([line('B/L NO.: 7318642',700,100,200),line('0047318',800,100,60)]);
},decodeImageFileV3:async()=>({}),imageDataToFileV3:async()=>clean,grayscalePaperV110323:x=>x,normalizePaperV110323:x=>x,classifyDocument:()=>({type:{id:'bol'}}),arbitrateDocumentTypeV104:()=>({type:{id:'bol'}}),documentTypeMeta:()=>({id:'other'}),parseSmartDocumentTextByTypeV104:()=>({})});
const result=await read(original);
assert.equal(planned,1);assert.equal(calls.length,4);assert.equal(calls.at(-1).options.pageSegMode,'7');
assert.equal(result.pageCount,1);assert.equal(result.ocrEvidenceV110323.at(-1).scope,'region');
assert.ok(result.text.includes('BODY MUST SURVIVE'));
assert.ok(result.ocrEvidenceV110323.some(pass=>pass.sourceImageFile===original));
const dimensions=Object.fromEntries(result.ocrEvidenceV110323.map(pass=>[`page-1:${pass.id}`,pass.imageSize]));
const reviewed=reviewScanAnalysis(result,{dimensions}),field=reviewed.documents[0].fields.bolNumber;
assert.equal(field.value,null);assert.equal(field.status,'needs_review');
assert.ok(field.candidates.some(candidate=>candidate.rawValue==='0047318642'));
assert.equal(reviewed.pageCount,1);
console.log('PASS — partial identifiers trigger one bounded reread and remain source-backed alternatives, with the whole page retained');
