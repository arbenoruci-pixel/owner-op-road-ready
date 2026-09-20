import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reviewScanAnalysis} from '../../source/src/modules/scan/ownedReaderAdapter.js';
import {resolveEvidence} from '../../packages/smart-reader-core/src/index.js';
import {needsReadingRetry,hasReadableBolReference} from '../../packages/smart-reader-core/src/ocrRetry.js';
const source=fs.readFileSync('source/src/modules/scan/imageReaderV110323.js','utf8').replace(/^import .*;\n/gm,'').replace('export async function readImageDocumentV110323','async function readImageDocumentV110323');
const factory=new Function('deps','const {needsReadingRetry,hasReadableBolReference,needsAmountSourceVerification,planPartyRegions,preparePartyDetails,prepareIdentifierDetail,checkCancelled,monotonicProgress,qualifyDocumentFieldsV11038,recognizeDocumentText,decodeImageFileV3,imageDataToFileV3,grayscalePaperV110323,normalizePaperV110323,classifyDocument,arbitrateDocumentTypeV104,documentTypeMeta,parseSmartDocumentTextByTypeV104}=deps;'+source+';return readImageDocumentV110323;');
test('production reader keeps barcode pixels distinct and preserves whole-page text',async()=>{
  const original={type:'image/png',name:'synthetic-source'},clean={type:'image/png'},detail={type:'image/png'},barcodeFile={type:'image/png'},calls=[];let planned=0;
  const read=factory({needsReadingRetry,hasReadableBolReference,needsAmountSourceVerification:()=>false,planPartyRegions:()=>[],preparePartyDetails:async()=>[],
    prepareIdentifierDetail:async(passes,cancel,file)=>{assert.equal(file,original);planned++;return {file:detail,sourcePassId:'1-clean-page',region:{left:100,top:90,width:300,height:40},barcode:{value:'0012345000',region:{left:90,top:10,width:320,height:120}},barcodeFile};},
    checkCancelled:()=>{},monotonicProgress:()=>()=>{},qualifyDocumentFieldsV11038:()=>({fields:{}}),
    recognizeDocumentText:async(file,options)=>{calls.push({file,options});return {text:'BILL OF LADING\nBOL NO: 0012345000\nSHIP FROM: Example Foods\nSHIP TO: Example Market\nBODY MUST SURVIVE',confidence:.96,lines:[],words:[]};},
    decodeImageFileV3:async()=>({}),imageDataToFileV3:async()=>clean,grayscalePaperV110323:x=>x,normalizePaperV110323:x=>x,
    classifyDocument:()=>({type:{id:'bol'}}),arbitrateDocumentTypeV104:()=>({type:{id:'bol'}}),documentTypeMeta:()=>({id:'other'}),parseSmartDocumentTextByTypeV104:()=>({})});
  const analysis=await read(original);assert.equal(planned,1);assert.ok(analysis.text.includes('BODY MUST SURVIVE'));assert.ok(calls.every(call=>call.file!==detail));
  const pass=analysis.ocrEvidenceV110323.find(p=>p.source==='barcode-code128');
  assert.equal(pass.sourceImageFile,barcodeFile);assert.equal(pass.scope,'region');assert.equal(pass.confidence,null);
  const result=reviewScanAnalysis(analysis,{documentId:'bounded-barcode',dimensions:{['page-1:'+pass.id]:pass.imageSize}});
  const check=result.documents[0].checks.find(c=>c.id==='bol_barcode_comparison');
  assert.equal(check.value,'0012345000');assert.equal(check.status,'passed');assert.deepEqual(check.evidence.box,{x:0,y:0,width:1,height:1});
  resolveEvidence(result,check.evidence);assert.equal(result.documents[0].canAutoFile,false);
});
