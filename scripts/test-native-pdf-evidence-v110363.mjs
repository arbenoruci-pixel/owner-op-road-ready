import assert from 'node:assert/strict';
import fs from 'node:fs';
import {nativePdfLayout} from '../packages/smart-reader-core/src/pdfLayout.js';
import {reviewScanAnalysis} from '../source/src/modules/scan/ownedReaderAdapter.js';
import {clearestEvidence} from '../packages/smart-reader-core/src/reviewEvidence.js';
const item=(str,x,y,width=200)=>({str,width,transform:[10,0,0,10,x,y],fontName:'regular'});
const content={styles:{regular:{ascent:.8}},items:[item('PRO # 86420 Rate Confirmation',30,740),
  item('TOTAL RATE 2300.00',30,700),item('PICK 1',30,650),
  item('123 EXAMPLE RD Appointment 09/16/26 08:00',30,630,400),item('ALBANY NY 12207',30,615),
  item('STOP 1',30,580),item('456 SAMPLE ST Appointment 09/22/26 08:00',30,560,400),item('MADISON WI 53703',30,545)]};
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({}),toBlob:cb=>cb(new Blob(['synthetic'],{type:'image/png'}))})};
const source=fs.readFileSync('source/src/modules/scan/pdfPageReaderV110328.js','utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
const read=new Function('readPdfImageV110348','checkCancelled','monotonicProgress','nativePdfLayout',source+';return readPdfPagesV110328;')(
  ()=>{throw new Error('native text must not need OCR');},()=>{},cb=>cb||(()=>{}),nativePdfLayout);
const pdf={numPages:1,getPage:async()=>({getTextContent:async()=>content,
  getViewport:({scale})=>({width:612*scale,height:792*scale,transform:[scale,0,0,-scale,0,792*scale]}),
  render:()=>({promise:Promise.resolve(),cancel(){}}),cleanup(){}})};
const output=await read(pdf,{enablePageOcr:true,retainPageSourcesV110347:true},items=>items.map(i=>i.str).join('\n'));
assert.equal(output.ocrEvidenceV110323.length,2,'native text and positioned evidence are both retained');
const pass=output.ocrEvidenceV110323[1];
assert.ok(pass.text.includes('\n'),'native lines must use real newlines');
assert.equal(pass.source,'pdf-text-layer');assert.equal(pass.sourceImageFile,output.pageFiles[0]);
const scale=1800/792,dimensions=Object.fromEntries(output.ocrEvidenceV110323.map(p=>[`page-1:${p.id}`,{width:Math.ceil(612*scale),height:1800}]));
const result=reviewScanAnalysis(output,{documentId:'synthetic-native',dimensions}),field=result.documents[0].fields.totalRate;
assert.equal(field.value,'2300.00');
const evidence=clearestEvidence(field.candidates.flatMap(c=>c.evidence));
assert.equal(evidence.source,'pdf-text-layer');assert.ok(evidence.box,'source review can highlight the total');
assert.ok(Math.abs(evidence.box.y-84/792)<.001,'highlight aligns with the rendered page');
assert.equal(result.documents[0].canAutoFile,false);
// Exercise the real import handler: new scans must request source retention
// and keep the rendered files returned by the reader through applyResult.
const intakeSource=fs.readFileSync('source/src/modules/scan/SmartScanSheetV105.jsx','utf8');
const start=intakeSource.indexOf('  async function chooseFile('),end=intakeSource.indexOf('\n  function acceptReaderReviewV110345',start);
assert.ok(start>=0&&end>start);
let imported;
const noop=()=>{},deps={scanGenerationV11036:{current:0},readAbortV110328:{current:null},
  normalizeScanPreferenceV11039:value=>value,initialPreferredType:'auto',previewUrl:'',state:{},profile:{},
  setIntakeDraftV110328:noop,setFile:noop,setPreviewUrl:noop,setStage:noop,setProgress:noop,setProgressText:noop,
  setMessage:value=>{if(value)throw new Error(value);},readBusinessStore:()=>({}),migrateBusinessStoreV105:value=>value,
  analyzeTruckDocumentV1040:async(file,options)=>{
    const reading=await read(pdf,{...options,enablePageOcr:true},items=>items.map(i=>i.str).join('\n'));
    return {...reading,scanMeta:{pageFiles:reading.pageFiles}};
  },applyResult:value=>{imported=value;},documentTypeMeta:()=>({id:'other'}),SMART_DOCUMENT_TYPES:[]};
const chooseFile=new Function(...Object.keys(deps),intakeSource.slice(start,end)+';return chooseFile;')(...Object.values(deps));
await chooseFile(new File(['synthetic PDF'],'example.pdf',{type:'application/pdf'}),'auto',{source:'test-import',pageFiles:['old preview']});
assert.equal(imported.ocrEvidenceV110323.length,2,'new imports retain positioned native observations');
assert.equal(imported.scanMeta.pageFiles[0],imported.ocrEvidenceV110323[1].sourceImageFile,'reader source files survive intake metadata');
assert.equal(imported.scanMeta.source,'test-import');
assert.equal(imported.scanMeta.originalFileName,'example.pdf');
delete globalThis.document;
console.log('PASS — new PDF import, retained source files, coordinates, source adapter, amount and highlight');
