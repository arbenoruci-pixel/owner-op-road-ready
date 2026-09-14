import {recognizeDocumentText} from './webOcr.js';
import {checkCancelled,monotonicProgress} from './scanIntakeV110328.js';

export function mergePdfFallbackV110328(reading, fallback) {
  // The legacy bridge/stream reader has no trustworthy page mapping. Keep
  // recovered text as supplemental evidence without claiming failed pages read.
  const seen=new Set(reading.pages.flatMap(page=>String(page.text||'').split(/\r?\n/)).map(line=>line.trim().replace(/\s+/g,' ').toLowerCase()));
  const extra=[];
  for(const line of String(fallback?.text||'').split(/\r?\n/)){
    const key=line.trim().replace(/\s+/g,' ').toLowerCase();
    if(key&&!seen.has(key)){seen.add(key);extra.push(line.trim());}
  }
  return {...reading,supplementalTextV110328:extra.join('\n'),fallbackMethodV110328:fallback?.method||''};
}

// Read missing image layers in imported PDFs, one page at a time. Native text
// keeps its positions; OCR is evidence only and cannot verify signatures.
export async function readPdfPagesV110328(pdf, options, readText) {
  const progress=monotonicProgress(options.onProgress),pages=[],unreadablePages=[],pageFiles=[],ocrEvidenceV110323=[];
  let photoPages=0;
  for(let number=1;number<=pdf.numPages;number++) {
    checkCancelled(options.signal);
    progress(.08+(number-1)/pdf.numPages*.78,`Reading PDF page ${number} of ${pdf.numPages}…`);
    let page,canvas,text='',method='native',confidence=1;
    try {
      page=await pdf.getPage(number);
      const content=await page.getTextContent({includeMarkedContent:true,disableNormalization:false});
      text=readText(content?.items||[]);
      // Page numbers and printer headers alone are not a usable text layer.
      if(options.enablePageOcr && (text.match(/\b[A-Za-z0-9]{2,}\b/g)||[]).length<18) {
        if(photoPages>=12){method='ocr-limit';confidence=0;unreadablePages.push(number);}
        else{
          photoPages++;checkCancelled(options.signal);
          const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(4,2600/Math.max(base.width,base.height))});
          canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          const rendering=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport,background:'#fff'});
          const cancel=()=>rendering.cancel();options.signal?.addEventListener('abort',cancel,{once:true});
          try { await rendering.promise; } finally { options.signal?.removeEventListener('abort',cancel); }
          checkCancelled(options.signal);
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
          if(!blob)throw new Error('page_render_failed');
          const input=new File([blob],`pdf-page-${number}.png`,{type:'image/png'});
          if(options.retainPageSourcesV110347)pageFiles[number-1]=input;
          const result=await recognizeDocumentText(input,{signal:options.signal,pageSegMode:'3',returnLayout:true,preserveSpaces:true,dpi:300,onProgress:value=>{if(!options.signal?.aborted)progress(.08+((number-1+value*.9)/pdf.numPages)*.78,`Reading PDF page ${number} of ${pdf.numPages}…`);}});
          checkCancelled(options.signal);
          if(result?.text?.trim()){text=result.text;confidence=Number(result.confidence||0);method='ocr';if(options.retainPageSourcesV110347)ocrEvidenceV110323.push({...result,id:`${number}-pdf-ocr`,page:number,sourceImageFile:input});}
          else{confidence=0;method='unreadable';unreadablePages.push(number);}
        }
      } else if(!text.trim()){confidence=0;unreadablePages.push(number);}
      if(options.retainPageSourcesV110347 && !pageFiles[number-1]) {
        checkCancelled(options.signal);
        const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(3,1800/Math.max(base.width,base.height))});
        canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        const rendering=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport,background:'#fff'});
        const cancel=()=>rendering.cancel();options.signal?.addEventListener('abort',cancel,{once:true});
        try { await rendering.promise; } finally { options.signal?.removeEventListener('abort',cancel); }
        checkCancelled(options.signal);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        if(!blob)throw new Error('page_render_failed');
        pageFiles[number-1]=new File([blob],`pdf-page-${number}.png`,{type:'image/png'});
      }
      if(options.retainPageSourcesV110347 && method==='native' && pageFiles[number-1]) {
        ocrEvidenceV110323.push({id:`${number}-pdf-native`,page:number,text,confidence:1,source:'pdf-text-layer',sourceImageFile:pageFiles[number-1]});
      }
    }catch(error){checkCancelled(options.signal);confidence=0;method='unreadable';unreadablePages.push(number);}
    finally{page?.cleanup?.();if(canvas){canvas.width=1;canvas.height=1;}}
    pages.push({pageNumber:number,text,method,confidence,wordCount:(text.match(/\b\w+\b/g)||[]).length,labelCount:(text.match(/\b(?:order|load|carrier|broker|rate|total|invoice|weight|gallons)\b/gi)||[]).length});
  }
  return {pages,...(options.retainPageSourcesV110347?{pageFiles,ocrEvidenceV110323}:{}),pageReadingV110328:{total:pdf.numPages,readable:pdf.numPages-unreadablePages.length,unreadablePages,needsReview:pages.some(page=>page.confidence<.82)},ocrUsed:photoPages>0};
}
