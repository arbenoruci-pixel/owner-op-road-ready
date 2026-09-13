import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FULL_PAGE,normalizeScanFile,validateSelection,movePage,validCorners,photoPagesToPdf,monotonicProgress,checkCancelled} from '../source/src/modules/scan/scanIntakeV110328.js';
import {detectDocumentEdgesV3} from '../source/src/modules/scan/v3/EdgeDetectorV3.js';

const jpeg=new File([new Uint8Array([255,216,255,0,128,10,255,217])],'page.jpg',{type:'image/jpeg'});
const blankType=new File([await jpeg.arrayBuffer()],'phone-photo.jpg');
const normalized=await normalizeScanFile(blankType);
assert.equal(normalized.type,'image/jpeg');assert.deepEqual(await normalized.arrayBuffer(),await blankType.arrayBuffer());
await assert.rejects(()=>normalizeScanFile(new File([],'empty.pdf')),/empty/);
await assert.rejects(()=>normalizeScanFile(new File(['<svg>'],'not-a-photo.png',{type:'image/png'})),/format/);
validateSelection([],Array(8).fill(jpeg));assert.throws(()=>validateSelection([jpeg],Array(8).fill(jpeg)),/No pages were added/);
assert.throws(()=>validateSelection([jpeg],[new File(['%PDF-1.4'],'document.pdf',{type:'application/pdf'})]),/one document/);
const original=[{id:'a'},{id:'b'},{id:'c'}],moved=movePage(original,'c',-1);
assert.deepEqual(moved.map(p=>p.id),['a','c','b']);assert.deepEqual(original.map(p=>p.id),['a','b','c']);assert.equal(movePage(original,'a',-1),original);
assert.ok(validCorners(FULL_PAGE));assert.equal(validCorners([FULL_PAGE[0],FULL_PAGE[2],FULL_PAGE[1],FULL_PAGE[3]]),false);
assert.equal(validCorners(Array(4).fill({x:.1,y:.1})),false);
const uncertain={width:100,height:130,data:new Uint8ClampedArray(100*130*4).fill(230)};
assert.deepEqual(detectDocumentEdgesV3(uncertain).corners,FULL_PAGE,'uncertain edges keep the full page');
const values=[],progress=monotonicProgress(p=>values.push(p));[.2,.1,.8,.3,1].forEach(progress);assert.deepEqual(values,[.2,.2,.8,.8,1]);

const packet=await photoPagesToPdf([{file:jpeg,width:600,height:800},{file:jpeg,width:800,height:600}]);
assert.equal(packet.type,'application/pdf');const bytes=Buffer.from(await packet.arrayBuffer()),text=bytes.toString('latin1');
assert.match(text,/\/Count 2/);assert.equal((text.match(/\/Type \/Page\b/g)||[]).length,2);
assert.equal((text.match(/\/Subtype \/Image/g)||[]).length,2);
const xref=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(text.slice(xref,xref+4),'xref');
const rows=text.slice(xref).split('\n').slice(3,11);rows.forEach((row,i)=>assert.equal(text.slice(Number(row.slice(0,10))).startsWith(`${i+1} 0 obj\n`),true));
assert.equal(bytes.indexOf(Buffer.from(await jpeg.arrayBuffer()))>=0,true,'PDF preserves the encoded page bytes');

// Execute the shipped reader with just native decode/OCR boundaries replaced.
// The page loop, fallbacks, confidence and cancellation are production code.
function loadReader(file,name,dependencies){const source=fs.readFileSync(file,'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,'');return new Function(...Object.keys(dependencies),source+`;return ${name};`)(...Object.values(dependencies));}
let calls=[],decoded=[],abortOnRead=null;
const sourcePage=number=>new File([String(number)],`page-${number}.jpg`,{type:'image/jpeg'});
const readImage=loadReader('source/src/modules/scan/imageReaderV110323.js','readImageDocumentV110323',{
  checkCancelled,monotonicProgress,
  recognizeDocumentText:async(file,options)=>{calls.push(file.name);options.onProgress?.(.8);options.onProgress?.(.2);if(abortOnRead)abortOnRead.abort();return {text:'FUEL RECEIPT\nTOTAL 55.00\nGALLONS 12.00\nDATE 09/13/2026',confidence:.96};},
  decodeImageFileV3:async file=>{decoded.push(file.name);if(file.name==='page-2.jpg')throw new Error('decode failed');return {name:file.name};},
  imageDataToFileV3:async pixels=>new File(['clean'],pixels.name,{type:'image/png'}),normalizePaperV110323:x=>x,grayscalePaperV110323:x=>x,
  qualifyDocumentFieldsV11038:result=>({...result,fields:{}}),classifyDocument:()=>({type:{id:'fuel_receipt'}}),documentTypeMeta:id=>({id}),arbitrateDocumentTypeV104:()=>({type:{id:'fuel_receipt'}}),parseSmartDocumentTextByTypeV104:()=>({})
});
const updates=[],result=await readImage(sourcePage(1),{scanMeta:{pageFiles:[sourcePage(1),sourcePage(2),sourcePage(3)]},onProgress:p=>updates.push(p)});
assert.equal(result.pageCount,3);assert.deepEqual(result.pageReadingV110328.unreadablePages,[2]);assert.equal(result.needsReview,true);assert.equal(result.confidence,.64);
assert.deepEqual(result.pages.map(p=>p.page),[1,3]);assert.match(result.text,/\[\[PAGE:3\]\]/);assert.deepEqual(decoded,['page-1.jpg','page-2.jpg','page-3.jpg']);
assert.ok(updates.every((p,i)=>!i||p>=updates[i-1]));
await assert.rejects(()=>readImage(sourcePage(1),{scanMeta:{pageFiles:Array(13).fill(sourcePage(1))}}),/No pages were skipped/);
calls=[];decoded=[];abortOnRead=new AbortController();
await assert.rejects(()=>readImage(sourcePage(1),{signal:abortOnRead.signal,scanMeta:{pageFiles:[sourcePage(1),sourcePage(3)]}}),{name:'AbortError'});
assert.equal(calls.length,1);assert.equal(decoded.length,1,'cancellation stops queued pages');abortOnRead=null;
decoded=[];await readImage(sourcePage(1),{scanMeta:{pageFiles:[sourcePage(1),sourcePage(3)],captureAssets:[{pageIndex:0,kind:'clean-ocr',filter:'paper-detail-v110323',file:sourcePage(1)},{pageIndex:1,kind:'clean-ocr',filter:'paper-detail-v110323',file:sourcePage(3)}]}});assert.deepEqual(decoded,[],'each page reuses its own prepared OCR image');

let cleaned=0,rendered=0;
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({}),toBlob:callback=>callback(new Blob(['page'],{type:'image/png'}))})};
const readPdf=loadReader('source/src/modules/scan/pdfPageReaderV110328.js','readPdfPagesV110328',{checkCancelled,monotonicProgress,recognizeDocumentText:async()=>({text:'BILL OF LADING\nBOL NO 550001\nEXAMPLE SHIPPER\nEXAMPLE RECEIVER',confidence:.9})});
const pdf={numPages:3,getPage:async number=>({getTextContent:async()=>{if(number===3)throw new Error('broken page');return {items:number===1?Array(25).fill('native'):[]};},getViewport:()=>({width:600,height:800}),render:()=>{rendered++;return {promise:Promise.resolve()};},cleanup:()=>cleaned++})};
const pdfResult=await readPdf(pdf,{enablePageOcr:true},items=>items.join(' '));assert.equal(rendered,1);assert.equal(cleaned,3);assert.deepEqual(pdfResult.pageReadingV110328,{total:3,readable:2,unreadablePages:[3],needsReview:true});assert.equal(pdfResult.pages[1].method,'ocr');assert.match(pdfResult.pages[1].text,/550001/);
// A PDF.js page failure must still reach the actual bridge/direct-stream reader.
// Neither reader may erase good page text or fabricate page-level coverage.
const {readPdfTextV102}=await import('../source/src/modules/scan/pdfTextV102.js');
let bridgeCalls=0;
globalThis.window={pdfjsLib:{getDocument:()=>({promise:Promise.resolve({...pdf,numPages:1,getPage:async()=>({getTextContent:async()=>{throw new Error('unsupported content stream');},cleanup:()=>{}}),destroy:async()=>{}})})},RoadReadyNative:{extractPdfText:async()=>{bridgeCalls++;return {text:'BILL OF LADING\nBOL NO 550100\nSHIP FROM: EXAMPLE SHIPPER\nSHIP TO: EXAMPLE RECEIVER',pageCount:1};}}};
const fallbackPdf=new File(['%PDF-1.4\n/Type /Page\nstream\n(BILL OF LADING) Tj\n(BOL NO 550099) Tj\n(SHIP FROM: EXAMPLE SHIPPER) Tj\n(SHIP TO: EXAMPLE RECEIVER) Tj\nendstream'],'broken-text-layer.pdf',{type:'application/pdf'});
const bridged=await readPdfTextV102(fallbackPdf,{enablePageOcr:true});
assert.equal(bridgeCalls,1);assert.match(bridged.text,/550100/);assert.equal(bridged.fallbackMethodV110328,'native-pdf-text');assert.equal(bridged.nativeText,false);assert.deepEqual(bridged.pageReadingV110328.unreadablePages,[1]);assert.equal(bridged.pageReadingV110328.needsReview,true);
delete window.RoadReadyNative;
const streamed=await readPdfTextV102(fallbackPdf,{enablePageOcr:true});assert.match(streamed.text,/550099/);assert.equal(streamed.fallbackMethodV110328,'pdf-text-v100');assert.equal(streamed.pageCount,1);
window.pdfjsLib.getDocument=()=>({promise:Promise.resolve({...pdf,numPages:2,getPage:async number=>({getTextContent:async()=>{if(number===2)throw new Error('broken second page');return {items:[{str:'NATIVE PAGE ONE '+Array(20).fill('carrier').join(' '),transform:[1,0,0,1,10,10],width:500,height:10}]};},cleanup:()=>{}}),destroy:async()=>{}})});
const partial=await readPdfTextV102(fallbackPdf,{enablePageOcr:true});assert.match(partial.text,/NATIVE PAGE ONE/);assert.match(partial.text,/550099/);assert.equal(partial.pageReadingV110328.total,2);assert.equal(partial.pageReadingV110328.readable,1);assert.deepEqual(partial.pageReadingV110328.unreadablePages,[2]);
console.log('PASS — document selection, byte-correct multipage PDF, crop safety, per-page OCR recovery, PDF image reading, native/stream fallback and cancellation');
