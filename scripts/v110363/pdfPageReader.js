import {readPdfImageV110348} from './pdfImageReaderV110348.js';
import {checkCancelled,monotonicProgress} from './scanIntakeV110328.js';
import {nativePdfLayout} from '../../../../packages/smart-reader-core/src/pdfLayout.js';
import {assessPdfCoverageV110363} from './pdfCoverageV110363.js';

const unique=values=>[...new Set(values)];
const confidenceOf=value=>Math.max(0,Math.min(.99,Number(value)||0));
const words=text=>(String(text||'').match(/[\p{L}\p{N}]+/gu)||[]).length;
function hasAdditionalWords(native,ocr) {
  const tokenize=value=>String(value||'').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
  const known=new Set(tokenize(native));
  return tokenize(ocr).some(word=>word.length>1&&!known.has(word));
}
function supplement(native,extra) {
  const seen=new Set(String(native||'').split(/\r?\n/).map(line=>line.trim().replace(/\s+/g,' ').toLowerCase()));
  return String(extra||'').split(/\r?\n/).filter(line=>{
    const key=line.trim().replace(/\s+/g,' ').toLowerCase();
    if(!key||seen.has(key))return false;seen.add(key);return true;
  }).join('\n');
}

export function mergePdfFallbackV110328(reading,fallback) {
  // Legacy fallback text has no reliable page mapping. It cannot clear a
  // failed/capped page or turn partial coverage into a successful full read.
  return {...reading,supplementalTextV110328:supplement(reading.pages.map(page=>page.text).join('\n'),fallback?.text),
    fallbackMethodV110328:fallback?.method||''};
}

async function renderSource(page,number,longest,signal) {
  checkCancelled(signal);
  const base=page.getViewport({scale:1});
  if(!Number.isFinite(base.width)||!Number.isFinite(base.height)||base.width<=0||base.height<=0)throw new Error('page_render_failed');
  const viewport=page.getViewport({scale:Math.min(4,longest/Math.max(base.width,base.height))});
  const canvas=document.createElement('canvas');
  canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  try {
    const context=canvas.getContext('2d',{alpha:false});
    if(!context)throw new Error('page_render_failed');
    const rendering=page.render({canvasContext:context,viewport,background:'#fff'});
    const cancel=()=>rendering.cancel();signal?.addEventListener('abort',cancel,{once:true});
    try {await rendering.promise;}finally{signal?.removeEventListener('abort',cancel);}
    checkCancelled(signal);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    checkCancelled(signal);
    if(!blob)throw new Error('page_render_failed');
    return {file:new File([blob],`pdf-page-${number}.png`,{type:'image/png'}),viewport};
  } finally {canvas.width=1;canvas.height=1;}
}

// Native observations always survive targeted OCR and failures. The original
// PDF belongs to intake; these rendered page files are additional review aids.
export async function readPdfPagesV110328(pdf,options={},readText) {
  const progress=monotonicProgress(options.onProgress),pages=[],pageFiles=[],ocrEvidenceV110323=[];
  const requested=Number(options.maxOcrPagesV110363);
  const ocrPageLimit=Number.isFinite(requested)?Math.max(0,Math.min(12,Math.floor(requested))):12;
  let ocrAttempts=0;
  for(let number=1;number<=pdf.numPages;number++) {
    checkCancelled(options.signal);
    progress(.08+(number-1)/pdf.numPages*.78,`Reading PDF page ${number} of ${pdf.numPages}…`);
    let page,nativeContent,rendered,nativeText='',ocrText='',text='',method='native',confidence=0;
    let coverage={nativeWordCount:0,nativeQuality:'empty',rasterInspection:'unavailable',imageCount:0,rasterRegions:[],reasons:[],ocrNeeded:true};
    const ocr={needed:false,status:'not-needed',attempted:false,failures:[]};
    const source={status:options.retainPageSourcesV110347?'pending':'not-requested'};
    try {
      page=await pdf.getPage(number);checkCancelled(options.signal);
      try {
        nativeContent=await page.getTextContent({includeMarkedContent:true,disableNormalization:false});
        checkCancelled(options.signal);nativeText=String(readText(nativeContent?.items||[])||'');
      } catch {checkCancelled(options.signal);coverage.reasons.push('native-text-error');}
      const nativeErrors=coverage.reasons;
      coverage=await assessPdfCoverageV110363(page,nativeText,page.getViewport({scale:1}));
      checkCancelled(options.signal);coverage.reasons=unique([...nativeErrors,...coverage.reasons]);
      coverage.ocrNeeded=coverage.ocrNeeded||nativeErrors.length>0;
      text=nativeText;confidence=nativeText.trim()?(coverage.nativeQuality==='usable'?.97:.6):0;
      ocr.needed=coverage.ocrNeeded;
      if(ocr.needed) {
        if(!options.enablePageOcr)ocr.status='disabled';
        else if(ocrAttempts>=ocrPageLimit)ocr.status='capped';
        else {
          ocrAttempts++;ocr.attempted=true;
          try {
            rendered=await renderSource(page,number,2600,options.signal);
            if(options.retainPageSourcesV110347){pageFiles[number-1]=rendered.file;source.status='retained';}
            const result=await readPdfImageV110348(rendered.file,{
              signal:options.signal,onProgress:value=>{if(!options.signal?.aborted)progress(.08+((number-1+Math.max(0,Math.min(1,Number(value)||0))*.9)/pdf.numPages)*.78,`Reading PDF page ${number} of ${pdf.numPages}…`);},
            },number);
            checkCancelled(options.signal);
            ocr.failures=result?.failures||[];
            ocr.fallbackUsed=Boolean(result?.fallbackUsed);
            ocrText=String(result?.text||'').trim();
            if(ocrText) {
              ocr.status='succeeded';ocr.confidence=confidenceOf(result.confidence);
              const extra=supplement(nativeText,ocrText);text=[nativeText,extra].filter(Boolean).join('\n');
              if(coverage.rasterRegions.length&&nativeText.trim()&&!hasAdditionalWords(nativeText,ocrText))coverage.reasons.push('raster-text-not-recovered');
              confidence=ocr.confidence;method=nativeText.trim()?'native+ocr':'ocr';
              if(options.retainPageSourcesV110347) {
                const passes=Array.isArray(result.passes)?result.passes:[];
                ocrEvidenceV110323.push(...(passes.length?passes:[{...result,id:`${number}-pdf-ocr`,page:number,sourceImageFile:rendered.file}]));
              }
            } else {ocr.status=result?.status==='unavailable'?'unavailable':result?.status==='error'?'error':'empty';}
          } catch(error) {
            checkCancelled(options.signal);
            ocr.status=/unavailable|failed to fetch|network|worker|load.*ocr/i.test(String(error?.message||''))?'unavailable':'error';
            ocr.failures.push({page:number,code:rendered?'ocr_failed':'page_render_failed'});
          }
        }
        if(ocr.status!=='succeeded'){
          confidence=Math.min(confidence,.65);method=nativeText.trim()?'native-partial':ocr.status==='capped'?'ocr-limit':'unreadable';
          coverage.reasons.push(`ocr-${ocr.status}`);
        }
      }
      // A failed review render must not erase otherwise available text. Keep
      // the original PDF as the fallback source and disclose missing previews.
      if(options.retainPageSourcesV110347&&!pageFiles[number-1]) {
        try {rendered=await renderSource(page,number,1800,options.signal);pageFiles[number-1]=rendered.file;source.status='retained';}
        catch {checkCancelled(options.signal);source.status='error';source.code='page_source_unavailable';coverage.reasons.push('page-source-unavailable');}
      }
    } catch {
      checkCancelled(options.signal);text=text||nativeText;method=text.trim()?'native-partial':'unreadable';confidence=Math.min(confidence,.65);
      coverage.reasons.push('page-read-error');if(source.status==='pending')source.status='error';
      if(!ocr.attempted)ocr.status='error';
    } finally {try{page?.cleanup?.();}catch{/* Cleanup cannot hide the page result. */}}
    // Even a viewport/preview/inspection failure after extraction must leave
    // the native observation available. Layout is optional, never a text gate.
    if(options.retainPageSourcesV110347&&nativeText.trim()) {
      const nativeConfidence=coverage.nativeQuality==='usable'?.97:.6;
      const nativeTextIntegrity=coverage.nativeQuality==='usable'?'decoded':'suspect';
      const nativePass={id:`${number}-pdf-native`,page:number,text:nativeText,confidence:nativeConfidence,source:'pdf-text-layer',nativeTextIntegrity,
        ...(pageFiles[number-1]?{sourceImageFile:pageFiles[number-1]}:{})};
      ocrEvidenceV110323.push(nativePass);
      try {
        // Native layout confidence describes decoded glyph/coordinate integrity,
        // not semantic accuracy or page coverage. Do not cap exact native cells
        // with the page's heuristic .97 score: the bounded native-stop proof
        // needs those cells independently of unread raster regions on the page.
        // Suspect mappings still carry the weaker signal and cannot prove stops.
        const lines=rendered?nativePdfLayout(nativeContent,rendered.viewport).map(line=>({...line,confidence:Math.min(Number(line.confidence)||0,nativeTextIntegrity==='decoded'?100:nativeConfidence*100)})):[];
        if(lines.length)ocrEvidenceV110323.push({...nativePass,id:`${number}-pdf-native-layout`,text:lines.map(line=>line.text).join('\n'),lines});
      } catch {coverage.reasons.push('native-layout-unavailable');}
    }
    const incomplete=coverage.rasterInspection!=='inspected'||coverage.reasons.some(reason=>['page-read-error','page-source-unavailable','raster-text-not-recovered'].includes(reason))||ocr.needed&&ocr.status!=='succeeded';
    if(incomplete)confidence=Math.min(confidence,.79);
    const needsReview=incomplete||confidence<.82;
    coverage={...coverage,reasons:unique(coverage.reasons),ocr,source,
      status:!text.trim()?'unreadable':incomplete?'partial':ocr.status==='succeeded'?'ocr':'native',needsReview};
    pages.push({pageNumber:number,text,nativeText,ocrText,method,confidence,coverage,
      wordCount:words(text),labelCount:(text.match(/\b(?:order|load|carrier|broker|rate|total|invoice|weight|gallons)\b/gi)||[]).length});
  }
  const pageNumbers=predicate=>pages.filter(predicate).map(page=>page.pageNumber);
  const unreadablePages=pageNumbers(page=>page.coverage.status==='unreadable');
  const partialPages=pageNumbers(page=>page.coverage.status==='partial');
  const reviewPages=pageNumbers(page=>page.coverage.needsReview);
  return {pages,...(options.retainPageSourcesV110347?{pageFiles,ocrEvidenceV110323}:{}),
    pageReadingV110328:{total:pdf.numPages,readable:pdf.numPages-unreadablePages.length-partialPages.length,
      textReadable:pdf.numPages-unreadablePages.length,
      unreadablePages,partialPages,reviewPages,needsReview:reviewPages.length>0,
      coverageComplete:unreadablePages.length===0&&partialPages.length===0,
      ocrPages:pageNumbers(page=>page.coverage.ocr.attempted),cappedPages:pageNumbers(page=>page.coverage.ocr.status==='capped'),
      ocrPageLimit,pages:pages.map(page=>({pageNumber:page.pageNumber,coverage:page.coverage})),
      diagnostics:pages.map(page=>({pageNumber:page.pageNumber,...page.coverage}))},ocrUsed:ocrAttempts>0};
}
