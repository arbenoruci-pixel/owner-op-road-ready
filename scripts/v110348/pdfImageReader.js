import {recognizeDocumentText} from './webOcr.js';
import {checkCancelled} from './scanIntakeV110328.js';

// Use the same bounded cleanup/retry pipeline as photo intake. Load on demand
// because image classification also imports the higher-level document reader.
export async function readPdfImageV110348(file, options, pageNumber) {
  checkCancelled(options.signal);
  let reading;
  const failures=[];
  try {
    const {readImageDocumentV110323} = await import('./imageReaderV110323.js');
    checkCancelled(options.signal);
    reading = await readImageDocumentV110323(file, {
      signal: options.signal, onProgress: options.onProgress,
      fileName: file.name, scanMeta: {pageFiles: [file]},
    });
  } catch (error) {
    checkCancelled(options.signal);
    failures.push({page:pageNumber,pass:'image-pipeline',code:'image_pipeline_failed'});
  }
  checkCancelled(options.signal);
  const best = reading?.pages?.[0];
  if (best?.text?.trim()) {
    const ids = new Map((reading.ocrEvidenceV110323 || []).map(pass => [pass.id, `${pageNumber}-pdf-${pass.id}`]));
    const passes = (reading.ocrEvidenceV110323 || []).map(pass => ({
      ...pass, id: ids.get(pass.id), page: pageNumber,
      ...(pass.sourcePassId ? {sourcePassId: ids.get(pass.sourcePassId)} : {}),
    }));
    return {text: best.text, confidence: best.confidence, passes,
      failures:[...failures,...(reading.ocrFailuresV110323||[]).map(failure=>({...failure,page:pageNumber}))],fallbackUsed:false};
  }
  // A failed cleanup must not discard a readable original render.
  let raw;
  try {
    raw = await recognizeDocumentText(file, {
      signal: options.signal, onProgress: options.onProgress,
      pageSegMode: '3', returnLayout: true, preserveSpaces: true, dpi: 300,
    });
  } catch (error) {
    checkCancelled(options.signal);
    const unavailable=/unavailable|failed to fetch|network|worker|load.*ocr/i.test(String(error?.message||''));
    return {text:'',confidence:0,passes:[],status:unavailable?'unavailable':'error',fallbackUsed:true,
      failures:[...failures,...(reading?.ocrFailuresV110323||[]).map(failure=>({...failure,page:pageNumber})),
        {page:pageNumber,pass:'source-fallback',code:unavailable?'ocr_unavailable':'ocr_failed'}]};
  }
  checkCancelled(options.signal);
  return {...raw, fallbackUsed:true,
    failures:[...failures,...(reading?.ocrFailuresV110323||[]).map(failure=>({...failure,page:pageNumber}))],
    passes: raw?.text?.trim() ? [{
    ...raw, id: `${pageNumber}-pdf-source-fallback`, page: pageNumber, sourceImageFile: file,
  }] : []};
}
