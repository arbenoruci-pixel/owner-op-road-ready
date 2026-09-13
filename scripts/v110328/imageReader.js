import {checkCancelled,monotonicProgress} from './scanIntakeV110328.js';
import {qualifyDocumentFieldsV11038} from './documentFieldSemanticsV11038.js';
import {recognizeDocumentText} from './webOcr.js';
import {decodeImageFileV3,imageDataToFileV3} from './v3/imageUtilsV3.js';
import {normalizePaperV110323,grayscalePaperV110323} from './paperQualityV110323.js';
import {classifyDocument,documentTypeMeta} from './smartScan.js';
import {arbitrateDocumentTypeV104} from './documentTypeArbiterV104.js';
import {parseSmartDocumentTextByTypeV104} from './smartDocumentReaderV104.js';

// Keep OCR passes independent: a retry is evidence, not an extra document page.
export async function readImageDocumentV110323(file,options={}) {
  const onProgress=monotonicProgress(options.onProgress),pages=options.scanMeta?.pageFiles||[];
  if(pages.some(f=>!f?.type?.startsWith('image/')))throw new Error('One of the selected pages is not a readable photo.');
  if(pages.length>12)throw new Error('Read up to 12 photo pages at a time. No pages were skipped.');
  checkCancelled(options.signal);
  const sourcePages=pages.length?pages:[file],passes=[],failures=[];
  for(let page=0;page<sourcePages.length;page++){
    checkCancelled(options.signal);
    const assets=(options.scanMeta?.captureAssets||[]).filter(asset=>Number(asset.pageIndex||0)===page);
    const original=assets.find(a=>a.kind==='perspective-corrected')?.file||sourcePages[page];
    let clean=assets.find(a=>a.kind==='clean-ocr'&&a.filter==='paper-detail-v110323')?.file;
    try{if(!clean){onProgress(.04+page/sourcePages.length*.9,`Preparing page ${page+1} of ${sourcePages.length}…`);const pixels=await decodeImageFileV3(original,{maxDimension:3000});checkCancelled(options.signal);clean=await imageDataToFileV3(grayscalePaperV110323(normalizePaperV110323(pixels)),'road-ready-clean-ocr.png');}}catch(error){checkCancelled(options.signal);failures.push({page:page+1,pass:'prepare',code:'page_unreadable'});continue;}
    let passIndex=0;
    async function read(input,id,mode){
      checkCancelled(options.signal);
      const pass=passIndex++;
      try{const result=await recognizeDocumentText(input,{pageSegMode:mode,returnLayout:true,preserveSpaces:true,dpi:300,onProgress:(p)=>{if(!options.signal?.aborted)onProgress(.05+((page+(pass+Math.min(1,p))/3)/sourcePages.length)*.88,`Reading page ${page+1} of ${sourcePages.length}${pass?' · Checking small print':''}…`);}});checkCancelled(options.signal);if(result?.text?.trim()){passes.push({...result,id:`${page+1}-${id}`,page:page+1});return result;}}
      catch(error){checkCancelled(options.signal);failures.push({page:page+1,pass:id,code:'ocr_failed'});}return null;
    }
    const first=await read(clean,'clean-page','3');
    const shipping=/bill\s+of\s+lading|ship\s*(?:from|to)|consignee|\bBOL\b/i.test(first?.text||'');
    // Sparse text mode recovers labels and values separated by table borders.
    if(shipping||!first||first.confidence<.88)await read(clean,'table-labels','11');
    // Verify original pixels when small identifiers/date digits remain uncertain.
    const pagePasses=passes.filter(p=>p.page===page+1);
    const criticalReads=shipping?pagePasses.map(p=>qualifyDocumentFieldsV11038({type:{id:'bol'},text:p.text,fields:{}}).fields):[];
    const disputed=shipping&&['bolNo','documentDate'].some(key=>new Set(criticalReads.map(f=>f[key]).filter(Boolean)).size>1||criticalReads.every(f=>!f[key]));
    if(!first||first.confidence<.78||disputed||shipping&&!pagePasses.some(p=>/\b(?:BOL|LADING)\s*(?:NUMBER|NO\.?|#)\s*[:#]?\s*[A-Z0-9._/-]*\d[A-Z0-9._/-]*/i.test(p.text)))await read(original,'source-page','11');
  }
  const bestPages=sourcePages.map((_,i)=>passes.filter(p=>p.page===i+1).sort((a,b)=>b.confidence-a.confidence||b.text.length-a.text.length)[0]).filter(Boolean);
  const unreadablePages=sourcePages.map((_,i)=>i+1).filter(page=>!bestPages.some(p=>p.page===page));
  const text=bestPages.map(p=>`[[PAGE:${p.page}]]\n${p.text}`).join('\n\n');
  const generic=classifyDocument(text,options.fileName||file.name||'');
  const decision=arbitrateDocumentTypeV104({fullText:text,fileName:options.fileName||file.name||'',preferredType:options.preferredType||'auto',genericClassification:generic});
  const type=decision.type||generic.type||documentTypeMeta('other');
  const fields=parseSmartDocumentTextByTypeV104(type.id,text,{},options.now||new Date());
  const confidence=bestPages.length?bestPages.reduce((n,p)=>n+p.confidence,0)/sourcePages.length:0;
  console.info('[smart-scan]',{engine:'110.3.23',pages:sourcePages.length,passes:passes.length,readablePages:bestPages.length,failures:failures.map(f=>f.code)});
  onProgress(1,'Document reading complete');
  return {type,detectedType:type,typeDecision:decision,text,fields,confidence,ocrConfidence:confidence,pageReadingV110328:{total:sourcePages.length,readable:bestPages.length,unreadablePages,needsReview:unreadablePages.length>0||confidence<.88},needsReview:unreadablePages.length>0||confidence<.88||type.id==='other',pageCount:sourcePages.length,method:'paper-detail-ocr-v110323',ocrEvidenceV110323:passes,ocrFailuresV110323:failures,ocrPasses:passes.map(p=>({pass:p.id,confidence:p.confidence,textLength:p.text.length})),pages:bestPages.map(p=>({page:p.page,text:p.text,confidence:p.confidence})),originalFileName:options.fileName||file.name||''};
}
