import {recognizeDocumentText} from './webOcr.js';
import {checkCancelled,monotonicProgress} from './scanIntakeV110328.js';

// Read missing image layers in imported PDFs, one page at a time. Native text
// keeps its positions; OCR is evidence only and cannot verify signatures.
export async function readPdfPagesV110328(pdf, options, readText) {
  const progress=monotonicProgress(options.onProgress),pages=[],unreadablePages=[];
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
          await page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport,background:'#fff'}).promise;
          checkCancelled(options.signal);
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
          if(!blob)throw new Error('page_render_failed');
          const input=new File([blob],`pdf-page-${number}.png`,{type:'image/png'});
          const result=await recognizeDocumentText(input,{pageSegMode:'3',returnLayout:true,preserveSpaces:true,dpi:300,onProgress:value=>{if(!options.signal?.aborted)progress(.08+((number-1+value*.9)/pdf.numPages)*.78,`Reading PDF page ${number} of ${pdf.numPages}…`);}});
          checkCancelled(options.signal);
          if(result?.text?.trim()){text=result.text;confidence=Number(result.confidence||0);method='ocr';}
          else{confidence=0;method='unreadable';unreadablePages.push(number);}
        }
      } else if(!text.trim()){confidence=0;unreadablePages.push(number);}
    }catch(error){checkCancelled(options.signal);confidence=0;method='unreadable';unreadablePages.push(number);}
    finally{page?.cleanup?.();if(canvas){canvas.width=1;canvas.height=1;}}
    pages.push({pageNumber:number,text,method,confidence,wordCount:(text.match(/\b\w+\b/g)||[]).length,labelCount:(text.match(/\b(?:order|load|carrier|broker|rate|total|invoice|weight|gallons)\b/gi)||[]).length});
  }
  return {pages,pageReadingV110328:{total:pdf.numPages,readable:pdf.numPages-unreadablePages.length,unreadablePages,needsReview:pages.some(page=>page.confidence<.82)},ocrUsed:photoPages>0};
}
