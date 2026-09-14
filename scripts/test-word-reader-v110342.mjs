import assert from 'node:assert/strict';
import fs from 'node:fs';
import {wordLayoutFixture} from '../packages/smart-reader-core/test/word-layout-fixture.mjs';
import {reviewScanAnalysis} from '../source/src/modules/scan/ownedReaderAdapter.js';
import {recognizeDocumentText,terminateWebOcr} from '../source/src/modules/scan/webOcr.js';
const pass=wordLayoutFixture(),result=reviewScanAnalysis({pageCount:1,ocrEvidenceV110323:[pass]},{dimensions:{'page-1:word-layout':pass.imageSize}});
assert.equal(result.documents[0].fields.bolNumber.value,'B-17');assert.equal(result.documents[0].fields.poNumber.value,'ORDER-77');
assert.equal(result.documents[0].fields.shipper.candidates[0].value,'Example Foods Inc.');
let calls=0,stops=0,failParameters=false;const parameters=[];
globalThis.window={Tesseract:{createWorker:async()=>({setParameters:async p=>{if(failParameters)throw Error('parameter failure');parameters.push(p);},terminate:async()=>{stops++;},recognize:async()=>{calls++;return {data:{text:'BOL NO: B-17',confidence:96,tsv:'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n1\t1\t0\t0\t0\t0\t0\t0\t1000\t1200\t-1\t\n5\t1\t1\t1\t1\t1\t50\t100\t40\t20\t96\tBOL\n5\t1\t1\t1\t1\t2\t100\t100\t30\t20\t96\tNO:\n5\t1\t1\t1\t1\t3\t150\t100\t40\t20\t96\tB-17'}};}})}};
try{
  const file=new Blob(['synthetic'],{type:'image/png'});
  const first=await recognizeDocumentText(file,{returnLayout:true});assert.deepEqual(first.imageSize,{width:1000,height:1200});assert.equal(first.words.length,3);
  await recognizeDocumentText(file,{returnLayout:true});assert.equal(calls,1);
  await recognizeDocumentText(file,{returnLayout:true,thresholdingMethod:'2'});assert.equal(calls,2);assert.equal(parameters.at(-1).thresholding_method,'2');
  await recognizeDocumentText(new Blob(['another'],{type:'image/png'}),{returnLayout:true});assert.equal(parameters.at(-1).thresholding_method,'0');
  failParameters=true;await assert.rejects(recognizeDocumentText(new Blob(['failure'],{type:'image/png'}),{thresholdingMethod:'2'}),/parameter failure/);assert.equal(stops,1);assert.equal(calls,3);
}finally{await terminateWebOcr();delete globalThis.window;}
// Exercise the materialized reader's retry and page-selection control flow with
// deterministic OCR and image boundaries. Region reads cannot replace page text.
const source=fs.readFileSync('source/src/modules/scan/imageReaderV110323.js','utf8').replace(/^import .*;\n/gm,'').replace('export async function readImageDocumentV110323','async function readImageDocumentV110323');
const {needsReadingRetry,hasReadableBolReference}=await import('../packages/smart-reader-core/src/ocrRetry.js');
const readCalls=[],original={type:'image/png',name:'source'},clean={type:'image/png'},detailFile={type:'image/png'};
const factory=new Function('deps',`const {needsReadingRetry,hasReadableBolReference,prepareIdentifierDetail,checkCancelled,monotonicProgress,qualifyDocumentFieldsV11038,recognizeDocumentText,decodeImageFileV3,imageDataToFileV3,grayscalePaperV110323,normalizePaperV110323,classifyDocument,arbitrateDocumentTypeV104,documentTypeMeta,parseSmartDocumentTextByTypeV104}=deps;${source};return readImageDocumentV110323;`);
const dependencies={needsReadingRetry,hasReadableBolReference,prepareIdentifierDetail:async()=>({file:detailFile,sourcePassId:'1-clean-page',region:{left:50,top:50,width:200,height:40}}),checkCancelled:()=>{},monotonicProgress:()=>()=>{},qualifyDocumentFieldsV11038:()=>({fields:{}}),recognizeDocumentText:async(file,options)=>{readCalls.push({file,options});return file===detailFile?{text:'BALNO: 00991234',confidence:.99,lines:[]}:{text:'BILL OF LADING\nSHIP FROM: Example Foods\nSHIP TO: Example Market\nBODY MUST SURVIVE',confidence:.95,lines:[]};},decodeImageFileV3:async()=>({}),imageDataToFileV3:async()=>clean,grayscalePaperV110323:x=>x,normalizePaperV110323:x=>x,classifyDocument:()=>({type:{id:'bol'}}),arbitrateDocumentTypeV104:()=>({type:{id:'bol'}}),documentTypeMeta:()=>({id:'other'}),parseSmartDocumentTextByTypeV104:()=>({})};
const read=factory(dependencies);
const reading=await read(original);
assert.equal(readCalls.length,4);assert.equal(readCalls[1].options.thresholdingMethod,'2');assert.equal(readCalls[3].options.pageSegMode,'7');
assert.equal(reading.pageCount,1);assert.equal(reading.ocrEvidenceV110323.at(-1).scope,'region');assert.ok(reading.text.includes('BODY MUST SURVIVE'));assert.ok(!reading.text.includes('BALNO'));
let receiptAttempts=0;
const receiptText='UNLOADING RECEIPT\nRECEIPT # R-17\nLOAD DETAILS\nRELAY PAYMENT DETAILS\nAmount $180.00\nCheckout Fee $5.00\nNET TOTAL $185.00';
const receiptRead=factory({...dependencies,recognizeDocumentText:async()=>({text:++receiptAttempts===1?'RECEIPT\nCarrier: Example Transport':receiptText,confidence:receiptAttempts===1?.99:.91,lines:[]})});
const receiptReading=await receiptRead(original);assert.equal(receiptAttempts,2,'confident incomplete OCR still retries');assert.ok(receiptReading.text.includes('NET TOTAL'),'a complete whole-page read outranks a higher-confidence incomplete one');
console.log('PASS — word evidence, OCR image bounds, contrast cache isolation, failed parameters, bounded retries and whole-page preservation');
