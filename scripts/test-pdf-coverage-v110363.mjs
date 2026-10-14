import assert from 'node:assert/strict';
import fs from 'node:fs';
import {nativePdfLayout} from '../packages/smart-reader-core/src/pdfLayout.js';
import {assessPdfCoverageV110363,inspectPdfOperatorsV110363,nativePdfQualityV110363} from './v110363/pdfCoverage.js';

// All text, pixels and PDF.js objects here are synthetic. No OCR network or
// account/document data is used. --runtime also verifies the materialized copy.
const runtime=process.argv.includes('--runtime');
const sourcePath=runtime?'source/src/modules/scan/pdfPageReaderV110328.js':'scripts/v110363/pdfPageReader.js';
const imagePath=runtime?'source/src/modules/scan/pdfImageReaderV110348.js':'scripts/v110348/pdfImageReader.js';
if(runtime) {
  assert.equal(fs.readFileSync(sourcePath,'utf8'),fs.readFileSync('scripts/v110363/pdfPageReader.js','utf8'));
  assert.equal(fs.readFileSync('source/src/modules/scan/pdfCoverageV110363.js','utf8'),fs.readFileSync('scripts/v110363/pdfCoverage.js','utf8'));
  assert.equal(fs.readFileSync(imagePath,'utf8'),fs.readFileSync('scripts/v110348/pdfImageReader.js','utf8'));
}
const readerSource=fs.readFileSync(sourcePath,'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
const cancel=signal=>{if(signal?.aborted)throw new DOMException('Canceled','AbortError');};
const monotonic=callback=>{let top=0;return (value,message)=>{top=Math.max(top,value);callback?.(top,message);};};
const compile=ocr=>new Function('readPdfImageV110348','checkCancelled','monotonicProgress','nativePdfLayout','assessPdfCoverageV110363',readerSource+';return {read:readPdfPagesV110328,merge:mergePdfFallbackV110328};')(ocr,cancel,monotonic,nativePdfLayout,assessPdfCoverageV110363);
const rich='EXAMPLE CARRIER SHIPPING DOCUMENT\nThis synthetic native header has enough readable words to exceed the old threshold while preserving independent source text and values.\nInvoice: NATIVE-742';
const viewport=(scale=1)=>({width:600*scale,height:800*scale,transform:[scale,0,0,-scale,0,800*scale]});
const item=(str,index)=>({str,width:550,transform:[10,0,0,10,20,760-index*20],fontName:'regular'});
const operations=(matrix)=>({fnArray:[10,12,85,11],argsArray:[[],matrix,['synthetic-image',1200,1600],[]]});
const raster=operations([550,0,0,550,25,80]);
const nativeContent=text=>({styles:{regular:{ascent:.8}},items:text.split('\n').map(item)});
const originalDocument=globalThis.document;
let renderCount=0,ocrCalls=[],cleanups=0;
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({}),toBlob:callback=>callback(new Blob(['synthetic-render'],{type:'image/png'}))})};
function pdfWith(descriptions) {
  return {numPages:descriptions.length,getPage:async number=>{
    const desc=descriptions[number-1];if(desc.pageError)throw new Error('synthetic page error');
    return {getTextContent:async()=>{desc.onText?.();if(desc.textError)throw new Error('synthetic native error');return nativeContent(desc.text??rich);},
      getOperatorList:async()=>{if(desc.operatorError)throw new Error('synthetic operator error');return desc.operators||{fnArray:[],argsArray:[]};},
      getViewport:({scale})=>{if(desc.viewportError)throw new Error('synthetic viewport error');return viewport(scale);},render:()=>{renderCount++;desc.onRender?.();return {promise:desc.renderError?Promise.reject(new Error('synthetic render error')):Promise.resolve(),cancel(){}};},
      cleanup(){cleanups++;if(desc.cleanupError)throw new Error('synthetic cleanup error');}};
  }};
}
const readText=items=>items.map(value=>value.str).join('\n');
const baseOcr=async(file,options,number)=>{ocrCalls.push(number);options.onProgress?.(.8);options.onProgress?.(.2);return {text:'BILL OF LADING\nBOL: SYNTHETIC-742\nTOTAL RATE 2300.00',confidence:.94,passes:[{id:`${number}-synthetic-pass`,page:number,sourceImageFile:file,text:'BOL: SYNTHETIC-742\nTOTAL RATE 2300.00',confidence:.94}]};};
const reset=()=>{renderCount=0;ocrCalls=[];cleanups=0;};
try {
  // Text-only and a small corner logo are negative controls, not whole-page OCR.
  reset();let {read,merge}=compile(baseOcr);
  let result=await read(pdfWith([{},{operators:operations([60,0,0,60,510,720])}]),{enablePageOcr:true},readText);
  assert.deepEqual(ocrCalls,[]);assert.equal(renderCount,0);assert.equal(result.pageReadingV110328.coverageComplete,true);
  assert.ok(result.pages.every(page=>page.confidence<1&&page.coverage.status==='native'));
  assert.equal(result.pages[1].coverage.imageCount,1);assert.deepEqual(result.pages[1].coverage.rasterRegions,[]);

  // The former >18-word native gate must not hide a scanned form body.
  reset();const progress=[];
  result=await read(pdfWith([{operators:raster}]),{enablePageOcr:true,retainPageSourcesV110347:true,onProgress:value=>progress.push(value)},readText);
  assert.ok(result.pages[0].coverage.nativeWordCount>18);assert.deepEqual(ocrCalls,[1]);assert.equal(renderCount,1);
  assert.equal(result.pages[0].method,'native+ocr');assert.equal(result.pages[0].nativeText,rich);
  assert.match(result.pages[0].text,/NATIVE-742/);assert.match(result.pages[0].text,/SYNTHETIC-742/);
  assert.equal(result.ocrEvidenceV110323.filter(pass=>pass.source==='pdf-text-layer').length,2);
  const nativePass=result.ocrEvidenceV110323.find(pass=>pass.id==='1-pdf-native-layout');
  assert.ok(nativePass.lines.length);assert.equal(nativePass.sourceImageFile,result.pageFiles[0]);
  assert.equal(nativePass.nativeTextIntegrity,'decoded');
  assert.ok(nativePass.lines.every(line=>line.confidence===100),'exact native glyphs are not downgraded by page coverage');
  assert.equal(result.ocrEvidenceV110323[0].sourceImageFile,result.pageFiles[0]);
  assert.ok(progress.every((value,index)=>!index||value>=progress[index-1]));
  assert.equal(result.pageReadingV110328.coverageComplete,true);assert.equal(result.pageReadingV110328.needsReview,false);

  // A narrow, field-bearing strip is detected, including within a form matrix.
  reset();result=await read(pdfWith([{operators:operations([300,0,0,25,30,300])},
    {operators:{fnArray:[74,12,85,75],argsArray:[[[1,0,0,1,20,30]],[400,0,0,300,0,0],['image'],[]]}}]),{enablePageOcr:true},readText);
  assert.deepEqual(ocrCalls,[1,2]);assert.equal(result.pages[1].coverage.rasterRegions.length,1);
  const rotated=inspectPdfOperatorsV110363(operations([0,400,-200,0,500,100]),viewport());
  assert.ok(rotated.rasterRegions[0].width>.3);assert.ok(rotated.rasterRegions[0].height>.4);
  assert.equal(inspectPdfOperatorsV110363({fnArray:[88],argsArray:[[]]},viewport()).status,'partial');
  assert.equal(inspectPdfOperatorsV110363({fnArray:Array(30001).fill(1),argsArray:Array(30001).fill([])},viewport()).status,'partial');

  // Word count is not quality; broken font mappings need OCR as well.
  assert.equal(nativePdfQualityV110363(rich).quality,'usable');
  assert.equal(nativePdfQualityV110363(rich+' \ufffd'.repeat(60)).quality,'weak');
  assert.equal(nativePdfQualityV110363('A '.repeat(32)).quality,'weak');
  reset();result=await read(pdfWith([{text:rich+' \ufffd'.repeat(60)},{textError:true}]),{enablePageOcr:true,retainPageSourcesV110347:true},readText);
  assert.deepEqual(ocrCalls,[1,2]);assert.ok(result.pages[1].coverage.reasons.includes('native-text-error'));
  assert.equal(result.pages[1].coverage.ocr.status,'succeeded');
  const suspectPass=result.ocrEvidenceV110323.find(pass=>pass.id==='1-pdf-native-layout');
  assert.equal(suspectPass.nativeTextIntegrity,'suspect');assert.ok(suspectPass.lines.every(line=>line.confidence<=60));

  // OCR repeating only the native header does not prove the raster was read.
  result=await compile(async()=>({text:rich,confidence:.99,passes:[]})).read(pdfWith([{operators:raster}]),{enablePageOcr:true},readText);
  assert.equal(result.pages[0].coverage.status,'partial');assert.equal(result.pageReadingV110328.coverageComplete,false);
  assert.equal(result.pageReadingV110328.readable,0);assert.equal(result.pageReadingV110328.textReadable,1);
  assert.ok(result.pages[0].confidence<.82);
  result=await compile(async()=>({text:rich.replace(/\s+/g,' ').toLowerCase(),confidence:.99,passes:[]})).read(pdfWith([{operators:raster}]),{enablePageOcr:true},readText);
  assert.equal(result.pages[0].coverage.status,'partial','reflowed native words do not establish raster coverage');
  result=await read(pdfWith([{operatorError:true},{operators:{fnArray:[88],argsArray:[[]]}}]),{enablePageOcr:true},readText);
  assert.equal(result.pageReadingV110328.coverageComplete,false,'successful OCR cannot hide unresolved graphics inspection');
  assert.deepEqual(result.pageReadingV110328.partialPages,[1,2]);

  // Disabled OCR, unavailable operator inspection and the budget are explicit.
  reset();result=await read(pdfWith([{operators:raster},{operatorError:true}]),{enablePageOcr:false},readText);
  assert.deepEqual(ocrCalls,[]);assert.deepEqual(result.pageReadingV110328.partialPages,[1,2]);
  assert.ok(result.pages.every(page=>page.coverage.ocr.status==='disabled'));
  reset();result=await read(pdfWith(Array.from({length:14},()=>({text:'',operators:raster}))),{enablePageOcr:true,retainPageSourcesV110347:true},readText);
  assert.equal(ocrCalls.length,12);assert.equal(renderCount,14);assert.equal(cleanups,14);
  assert.deepEqual(result.pageReadingV110328.cappedPages,[13,14]);assert.deepEqual(result.pageReadingV110328.unreadablePages,[13,14]);
  assert.equal(result.pageFiles.length,14);assert.equal(result.pages.length,14);assert.equal(result.pageReadingV110328.needsReview,true);
  assert.equal(result.pageReadingV110328.diagnostics[13].ocr.status,'capped');
  reset();result=await read(pdfWith([{operators:raster}]),{enablePageOcr:true,maxOcrPagesV110363:0},readText);
  assert.deepEqual(ocrCalls,[]);assert.deepEqual(result.pageReadingV110328.cappedPages,[1]);

  // Missing OCR services cannot replace native evidence with empty success.
  const offline=compile(async()=>{throw new Error('OCR worker unavailable');});
  result=await offline.read(pdfWith([{operators:raster},{text:'',operators:raster}]),{enablePageOcr:true,retainPageSourcesV110347:true},readText);
  assert.equal(result.pages[0].nativeText,rich);assert.equal(result.pages[0].text,rich);
  assert.equal(result.pages[0].coverage.ocr.status,'unavailable');assert.equal(result.pages[1].coverage.status,'unreadable');
  assert.equal(result.ocrEvidenceV110323[0].source,'pdf-text-layer');
  const merged=merge(result,{text:rich+'\nRecovered anonymous fallback',method:'synthetic-fallback'});
  assert.equal(merged.supplementalTextV110328,'Recovered anonymous fallback');
  assert.deepEqual(merged.pageReadingV110328,result.pageReadingV110328,'fallback must not manufacture coverage');
  result=await compile(async()=>({text:'',confidence:0,passes:[]})).read(pdfWith([{operators:raster}]),{enablePageOcr:true},readText);
  assert.equal(result.pages[0].coverage.ocr.status,'empty');assert.equal(result.pages[0].coverage.status,'partial');

  // Preview/render and page errors never erase native text or stop later pages.
  result=await read(pdfWith([{renderError:true},{pageError:true},{cleanupError:true}]),{enablePageOcr:true,retainPageSourcesV110347:true},readText);
  assert.equal(result.pages[0].text,rich);assert.equal(result.pages[0].coverage.source.status,'error');
  assert.equal(result.pages[0].coverage.status,'partial');assert.equal(result.pages[1].coverage.status,'unreadable');
  assert.equal(result.pages[2].coverage.status,'native');assert.equal(result.ocrEvidenceV110323[0].text,rich);
  result=await read(pdfWith([{viewportError:true}]),{enablePageOcr:true,retainPageSourcesV110347:true},readText);
  assert.equal(result.pages[0].text,rich);assert.equal(result.ocrEvidenceV110323[0].source,'pdf-text-layer');
  assert.equal(result.ocrEvidenceV110323[0].text,rich);assert.equal(result.pages[0].coverage.status,'partial');

  // Cancellation aborts the document instead of manufacturing an unreadable page.
  const controller=new AbortController();reset();
  await assert.rejects(()=>read(pdfWith([{operators:raster,onRender:()=>controller.abort()},{}]),{enablePageOcr:true,signal:controller.signal},readText),{name:'AbortError'});
  assert.deepEqual(ocrCalls,[]);assert.equal(cleanups,1);
  const duringOcr=new AbortController();
  await assert.rejects(()=>compile(async()=>{duringOcr.abort();throw new Error('synthetic cancel');}).read(pdfWith([{operators:raster},{}]),{enablePageOcr:true,signal:duringOcr.signal},readText),{name:'AbortError'});

  // The existing image cleanup pipeline still has a truthful original fallback.
  const helperSource=fs.readFileSync(imagePath,'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','').replace("import('./imageReaderV110323.js')",'loadImageReader()');
  let rawCalls=0;
  const helper=new Function('recognizeDocumentText','checkCancelled','loadImageReader',helperSource+';return readPdfImageV110348;')(
    async()=>{rawCalls++;return {text:'Synthetic original fallback',confidence:.8};},cancel,
    async()=>({readImageDocumentV110323:async()=>{throw new Error('synthetic cleanup failure');}}));
  const image=new File(['synthetic'],'original.png',{type:'image/png'});
  const recovered=await helper(image,{},7);
  assert.equal(rawCalls,1);assert.equal(recovered.fallbackUsed,true);assert.equal(recovered.failures[0].page,7);
  assert.equal(recovered.passes[0].sourceImageFile,image);assert.equal(recovered.passes[0].page,7);
  const noEngine=new Function('recognizeDocumentText','checkCancelled','loadImageReader',helperSource+';return readPdfImageV110348;')(
    async()=>{throw new Error('OCR worker unavailable');},cancel,async()=>{throw new Error('synthetic cleanup unavailable');});
  const unavailable=await noEngine(image,{},4);
  assert.equal(unavailable.status,'unavailable');assert.deepEqual(unavailable.passes,[]);assert.equal(unavailable.failures.length,2);
  assert.ok(unavailable.failures.every(failure=>failure.page===4));
  console.log(`PASS — ${runtime?'materialized':'source'} PDF coverage, mixed native/raster, field strips, native negative controls, preservation, budgets, diagnostics, fallback and cancellation`);
} finally {if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;}

if(runtime)await import('./test-pdf-native-stop-integrity-v110363.mjs');
