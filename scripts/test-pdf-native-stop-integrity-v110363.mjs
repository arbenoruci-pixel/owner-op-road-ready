import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readDocument,textObservation,resolveEvidence} from '../packages/smart-reader-core/src/index.js';
import {nativePdfLayout} from '../packages/smart-reader-core/src/pdfLayout.js';
import {separateWordColumns} from '../packages/smart-reader-core/src/wordLayout.js';
import {sertifiRateInput} from '../packages/smart-reader-core/test/sertifi-rate-fixture.mjs';
import {assessPdfCoverageV110363} from './v110363/pdfCoverage.js';

// Use the actual generated adapter, not a hand-reimplemented confidence mapping.
// These are synthetic PDF.js text items for the browser's three-page RateCon;
// no PDF.js CDN, OCR service, real document or account is accessed.
const runtimeRoot=process.env.READER_RUNTIME_ROOT||process.cwd();
const readerPath=process.argv.includes('--runtime')?path.join(runtimeRoot,'source/src/modules/scan/pdfPageReaderV110328.js'):'scripts/v110363/pdfPageReader.js';
const adapterPath=path.join(runtimeRoot,'source/src/modules/scan/ownedReaderAdapter.js');
const executable=file=>fs.readFileSync(file,'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
const read=new Function('readPdfImageV110348','checkCancelled','monotonicProgress','nativePdfLayout','assessPdfCoverageV110363',
  executable(readerPath)+';return readPdfPagesV110328;')(
  async()=>{throw new Error('synthetic native text must not need OCR');},()=>{},callback=>callback||(()=>{}),nativePdfLayout,assessPdfCoverageV110363);
const adapter=new Function('readDocument','textObservation','separateWordColumns',executable(adapterPath)+';return {inputFromScanAnalysis,reviewScanAnalysis};')(readDocument,textObservation,separateWordColumns);
const fixture=sertifiRateInput(),width=612,height=792;
const item=(str,x,y,size=8)=>({str,width:str.length*size*.6,height:size,fontName:'courier',transform:[size,0,0,size,x,y]});
const contents=fixture.pages.map((page,index)=>({styles:{courier:{ascent:.629}},items:index===0?[
  ...page.observations[1].lines.map(line=>item(line.text,line.box.x*width,height-(line.box.y+line.box.height)*height)),
  ...['Weight: 36000','- ALL PAGES OF PODs MUST BE TURNED IN WITHIN 48h OF DELIVERY',
    '- Detention paid after 3h at a rate of $30 per hour, not exceeding $150 per 24h'].map((text,i)=>item(text,30,320-i*18)),
]:page.observations[0].lines.map((line,i)=>item(line.text,30,755-i*20,9))}));
const pdf=(partial=false)=>({numPages:3,getPage:async number=>({
  getTextContent:async()=>contents[number-1],
  getOperatorList:async()=>partial&&number===1?{fnArray:[10,12,85,11],argsArray:[[],[300,0,0,80,30,40],['synthetic-raster'],[]]}:{fnArray:[],argsArray:[]},
  getViewport:({scale})=>({width:width*scale,height:height*scale,transform:[scale,0,0,-scale,0,height*scale]}),
  render:()=>({promise:Promise.resolve(),cancel(){}}),cleanup(){},
})});
const priorDocument=globalThis.document;
globalThis.document={createElement:()=>({getContext:()=>({}),toBlob:callback=>callback(new Blob(['synthetic page'],{type:'image/png'}))})};
try {
  for(const partial of [false,true]) {
    const reading=await read(pdf(partial),{enablePageOcr:!partial,retainPageSourcesV110347:true},items=>items.map(i=>i.str).join('\n'));
    const dimensions=Object.fromEntries(reading.ocrEvidenceV110323.map(pass=>[`page-${pass.page}:${pass.id}`,{width:Math.ceil(width*1800/height),height:1800}]));
    const options={documentId:'synthetic-native-integrity',dimensions};
    const input=adapter.inputFromScanAnalysis(reading,options);
    const layout=input.pages[0].observations.find(observation=>observation.id==='1-pdf-native-layout');
    assert.ok(layout.lines.every(line=>line.confidence===1),'native extraction scale remains 100→1, not page .97 or .0097');
    assert.equal(reading.ocrEvidenceV110323.find(pass=>pass.id==='1-pdf-native-layout').nativeTextIntegrity,'decoded');
    const result=adapter.reviewScanAnalysis(reading,options),fields=result.documents[0].fields;
    for(const [key,value] of Object.entries({shipper:'SAMPLE RAIL TERMINAL',consignee:'EXAMPLE RECEIVING LLC',pickupDate:'2025-07-12',deliveryDate:'2025-07-14'})) {
      assert.equal(fields[key].value,value,key);assert.equal(fields[key].status,'supported',key);
      assert.ok(fields[key].candidates.some(candidate=>candidate.evidence.some(evidence=>evidence.supportMethod==='native_stop_block')));
    }
    assert.equal(fields.deliveryAddress.value,null);assert.deepEqual(fields.deliveryAddress.issues,['incomplete_address']);
    assert.equal(fields.weight.value,null);assert.deepEqual(fields.weight.issues,['weight_unit_required']);
    assert.equal(result.documents.length,2);assert.equal(result.documents[1].kind,'signing_certificate');
    assert.equal(result.calibration.automaticAcceptance,false);assert.ok(result.documents.every(group=>!group.canAutoFile));
    for(const group of result.documents)for(const field of Object.values(group.fields))for(const candidate of field.candidates)
      for(const evidence of [...candidate.evidence,...candidate.labelEvidence||[],...candidate.continuationEvidence||[]])resolveEvidence(result,evidence);
    assert.equal(reading.pageReadingV110328.coverageComplete,!partial);
    assert.equal(reading.pages[0].coverage.needsReview,partial);
    assert.ok(reading.pages[0].confidence<1,'page coverage never inherits native line certainty');
    if(partial){assert.equal(reading.pages[0].coverage.ocr.status,'disabled');assert.equal(reading.pages[0].coverage.status,'partial');}

    // Exact-native provenance does not bypass weak or unpositioned cell guards.
    const weak=structuredClone(input),weakLayout=weak.pages[0].observations.find(observation=>observation.id===layout.id);
    weakLayout.lines.find(line=>line.text==='ELWOOD IL 60421').confidence=.6;
    assert.equal(readDocument(weak).documents[0].fields.shipper.value,null);
    const unpositioned=structuredClone(input);
    unpositioned.pages[0].observations.find(observation=>observation.id===layout.id).lines.forEach(line=>delete line.box);
    assert.equal(readDocument(unpositioned).documents[0].fields.shipper.value,null);
  }
  contents[0].items.push(item('\ufffd'.repeat(80),30,65));
  const suspect=await read(pdf(),{enablePageOcr:false,retainPageSourcesV110347:true},items=>items.map(i=>i.str).join('\n'));
  const suspectLayout=suspect.ocrEvidenceV110323.find(pass=>pass.id==='1-pdf-native-layout');
  assert.equal(suspectLayout.nativeTextIntegrity,'suspect');assert.ok(suspectLayout.lines.every(line=>line.confidence===60));
  const suspectDimensions=Object.fromEntries(suspect.ocrEvidenceV110323.map(pass=>[`page-${pass.page}:${pass.id}`,{width:Math.ceil(width*1800/height),height:1800}]));
  const suspectFields=adapter.reviewScanAnalysis(suspect,{documentId:'synthetic-suspect-native',dimensions:suspectDimensions}).documents[0].fields;
  assert.equal(suspectFields.shipper.value,null);assert.equal(suspectFields.consignee.value,null);
  assert.equal(suspect.pages[0].coverage.needsReview,true);
  console.log('PASS — native glyph integrity survives actual adapter and bounded stop proof independently of incomplete page coverage');
} finally {if(priorDocument===undefined)delete globalThis.document;else globalThis.document=priorDocument;}
