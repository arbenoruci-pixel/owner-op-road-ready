import assert from 'node:assert/strict';
import fs from 'node:fs';
const checkCancelled=signal=>{if(signal?.aborted)throw new DOMException('Canceled','AbortError');};
const input=new File(['synthetic'],'page.png',{type:'image/png'});
const clean=new File(['clean'],'clean.png',{type:'image/png'});
const detail=new File(['detail'],'detail.png',{type:'image/png'});
const source=fs.readFileSync('source/src/modules/scan/pdfImageReaderV110348.js','utf8')
  .replace(/^import .*;\n/gm,'').replace('export ','')
  .replace("import('./imageReaderV110323.js')",'loadImageReader()');
let rawCalls=0,mode='success';
const controller=new AbortController();
const imageRead=async(file,options)=>{
  assert.equal(file,input);assert.equal(options.signal,controller.signal);
  assert.deepEqual(options.scanMeta.pageFiles,[input]);
  if(mode==='abort'){controller.abort();throw new Error('interrupted');}
  if(mode==='failure')throw new Error('decode failed');
  return {pages:[{page:1,text:'BILL OF LADING\nBOL: EX-348',confidence:.93}],ocrEvidenceV110323:[
    {id:'1-clean-page',page:1,text:'BILL OF LADING',confidence:.8,sourceImageFile:clean},
    {id:'1-source-page',page:1,text:'BOL: EX-348',confidence:.93,sourceImageFile:input},
    {id:'1-identifier-detail',page:1,text:'EX-348',confidence:.95,scope:'region',sourcePassId:'1-source-page',region:{x:.1,y:.1,width:.4,height:.1},sourceImageFile:detail},
  ]};
};
const read=new Function('recognizeDocumentText','checkCancelled','loadImageReader',source+';return readPdfImageV110348;')(
  async(file,options)=>{rawCalls++;assert.equal(options.signal,controller.signal);return {text:'original fallback',confidence:.7};},
  checkCancelled,async()=>({readImageDocumentV110323:imageRead}),
);
const result=await read(input,{signal:controller.signal},3);
assert.equal(rawCalls,0);assert.equal(result.text,'BILL OF LADING\nBOL: EX-348');
assert.equal(result.passes.length,3);assert.ok(result.passes.every(p=>p.page===3));
assert.equal(result.passes[2].sourcePassId,result.passes[1].id);
assert.equal(result.passes[0].sourceImageFile,clean);assert.equal(result.passes[1].sourceImageFile,input);assert.equal(result.passes[2].sourceImageFile,detail);
assert.equal(result.passes[2].scope,'region');
const other=await read(input,{signal:controller.signal},4);
assert.equal(new Set([...result.passes,...other.passes].map(p=>p.id)).size,6,'no evidence ID collisions across PDF pages');
mode='failure';const fallback=await read(input,{signal:controller.signal},2);
assert.equal(rawCalls,1);assert.equal(fallback.passes[0].page,2);assert.equal(fallback.passes[0].sourceImageFile,input);
mode='abort';await assert.rejects(()=>read(input,{signal:controller.signal},1),{name:'AbortError'});
assert.equal(rawCalls,1,'cancellation must not start a raw fallback');

// Exercise PDF page iteration, native sources and multiple observations/page.
const pdfSource=fs.readFileSync('source/src/modules/scan/pdfPageReaderV110328.js','utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
let calls=0,renders=0;
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({}),toBlob:cb=>cb(new Blob(['page'],{type:'image/png'}))})};
const pdfRead=new Function('readPdfImageV110348','checkCancelled','monotonicProgress',pdfSource+';return readPdfPagesV110328;')(
  async(file,options,number)=>{calls++;assert.equal(number,2);return {...result,passes:result.passes.map(p=>({...p,page:number}))};},checkCancelled,cb=>cb||(()=>{}),
);
const pdf={numPages:2,getPage:async(number)=>({getTextContent:async()=>({items:[number===1?'Native document with enough readable printed words to keep its text layer and avoid OCR while preserving the source for review.':'2']}),getViewport:({scale})=>({width:612*scale,height:842*scale}),render:()=>{renders++;return {promise:Promise.resolve(),cancel(){}};},cleanup(){}})};
const output=await pdfRead(pdf,{enablePageOcr:true,retainPageSourcesV110347:true},items=>items.join('\n'));
assert.equal(calls,1);assert.equal(renders,2);assert.equal(output.pages.length,2);
assert.equal(output.pageFiles.length,2);assert.equal(output.ocrEvidenceV110323.length,4);
assert.equal(output.ocrEvidenceV110323[0].source,'pdf-text-layer');
assert.equal(output.ocrEvidenceV110323[0].sourceImageFile,output.pageFiles[0]);
assert.ok(output.ocrEvidenceV110323.slice(1).every(p=>p.page===2));
delete globalThis.document;
console.log('PASS — PDF photo pipeline, exact pass sources, page mapping, fallback and cancellation');
