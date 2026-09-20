import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('source/src/modules/scan/imageReaderV110323.js','utf8').replace(/^import .*;\n/gm,'').replace('export async function readImageDocumentV110323','async function readImageDocumentV110323');
const factory=new Function('deps','const {needsReadingRetry,hasReadableBolReference,needsAmountSourceVerification,planPartyRegions,preparePartyDetails,prepareIdentifierDetail,checkCancelled,monotonicProgress,qualifyDocumentFieldsV11038,recognizeDocumentText,decodeImageFileV3,imageDataToFileV3,grayscalePaperV110323,normalizePaperV110323,classifyDocument,arbitrateDocumentTypeV104,documentTypeMeta,parseSmartDocumentTextByTypeV104}=deps;'+source+';return readImageDocumentV110323;');
test('ranking evaluates each immutable pass once while preserving the selected page and all observations',async()=>{
  const original={type:'image/png'},clean={type:'image/png'},ranks=new Map();let calls=0;
  const read=factory({needsReadingRetry:passes=>{if(passes.length===1&&passes[0].id)ranks.set(passes[0].id,(ranks.get(passes[0].id)||0)+1);return passes.some(p=>p.confidence<.8);},
    hasReadableBolReference:()=>false,needsAmountSourceVerification:()=>false,planPartyRegions:()=>[],preparePartyDetails:async()=>[],prepareIdentifierDetail:async()=>null,
    checkCancelled:()=>{},monotonicProgress:()=>()=>{},qualifyDocumentFieldsV11038:()=>({fields:{}}),
    recognizeDocumentText:async()=>{calls++;return {text:['WEAK FIRST PAGE','SECOND PAGE','BEST ORIGINAL PAGE'][calls-1],confidence:[.5,.92,.96][calls-1],lines:[],words:[]};},
    decodeImageFileV3:async()=>({}),imageDataToFileV3:async()=>clean,grayscalePaperV110323:x=>x,normalizePaperV110323:x=>x,
    classifyDocument:()=>({type:{id:'other'}}),arbitrateDocumentTypeV104:()=>({type:{id:'other'}}),documentTypeMeta:()=>({id:'other'}),parseSmartDocumentTextByTypeV104:()=>({})});
  const result=await read(original);
  assert.equal(calls,3);assert.equal(result.ocrEvidenceV110323.length,3);assert.ok(result.text.includes('BEST ORIGINAL PAGE'));
  assert.equal(ranks.size,3);assert.ok([...ranks.values()].every(n=>n===1));
  assert.equal(result.ocrEvidenceV110323.at(-1).sourceImageFile,original);
});
