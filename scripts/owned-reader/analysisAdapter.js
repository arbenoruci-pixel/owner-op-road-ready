import {readDocument,textObservation} from '../../../../packages/smart-reader-core/src/index.js';
import {separateWordColumns} from '../../../../packages/smart-reader-core/src/wordLayout.js';

// The existing phone recognizer remains explicitly identified at this boundary.
// This adapter makes no OCR request, changes no legacy field and stores no file.
export function inputFromScanAnalysis(analysis, {documentId='scan-review',dimensions={}}={}) {
  const marked=[...String(analysis.text||'').matchAll(/\[\[PAGE:(\d+)\]\]([\s\S]*?)(?=\[\[PAGE:\d+\]\]|$)/g)].map(m=>({page:Number(m[1]),text:m[2]}));
  const explicit=(analysis.pages||[]).map((p,i)=>({page:Number(p.page??p.pageNumber??i+1),text:String(p.text||'')}));
  const passes=analysis.ocrEvidenceV110323||[];
  const declared=Number(analysis.pageReadingV110328?.total||analysis.pageCount||0);
  const count=Math.max(1,declared,...marked.map(p=>p.page),...explicit.map(p=>p.page),...passes.map(p=>Number(p.page||1)));
  if(!Number.isInteger(count)||count>200)throw new Error('Unsupported page count');
  const pages=Array.from({length:count},(_,i)=>{
    const number=i+1,id=`page-${number}`;
    const observations=passes.filter(p=>Number(p.page)===number).map((pass,pi)=>{
      const observationId=String(pass.id||`pass-${pi+1}`);
      const size=dimensions[`${id}:${observationId}`];
      // Only use layout on the exact image from this OCR pass. Other processing
      // variants may have different sizes/crops and cannot share coordinates.
      const useLayout=!!size && Array.isArray(pass.lines) && pass.lines.length>0;
      const observation=useLayout?{id:observationId,source:'existing-phone-ocr',lines:separateWordColumns(pass.lines,pass.words,size).map((line,li)=>{
        const {left,top,width,height}=line;
        const valid=[left,top,width,height].every(Number.isFinite)&&left>=0&&top>=0&&width>0&&height>0&&left+width<=size.width&&top+height<=size.height;
        return {id:`line-${li+1}`,text:String(line.text||'').replace(/[\r\n]/g,' '),
          confidence:Number.isFinite(line.confidence)&&line.confidence>=0&&line.confidence<=100?line.confidence/100:null,
          ...(valid?{box:{x:left/size.width,y:top/size.height,width:width/size.width,height:height/size.height}}:{})};
      })}:textObservation(pass.text||'',{id:observationId,source:'existing-phone-ocr'});
      if(!useLayout)for(const line of observation.lines){
        const readings=(pass.lines||[]).filter(source=>String(source.text||'').trim()===line.text.trim()).map(source=>source.confidence).filter(value=>Number.isFinite(value)&&value>=0&&value<=100);
        line.confidence=readings.length?Math.min(...readings)/100:Number.isFinite(pass.confidence)&&pass.confidence>=0&&pass.confidence<=1?pass.confidence:null;
      }
      if(size)observation.sourceImageId=`${documentId}:${id}:${observationId}`;
      return observation;
    });
    if(!observations.length){
      const text=marked.find(p=>p.page===number)?.text??explicit.find(p=>p.page===number)?.text??(count===1?analysis.text||'':'');
      observations.push(textObservation(text,{source:analysis.nativeText?'pdf-text-layer':'existing-document-text'}));
    }
    return {id,number,observations};
  });
  return {documentId,pages};
}

export function reviewScanAnalysis(analysis, options) {
  return readDocument(inputFromScanAnalysis(analysis,options));
}
