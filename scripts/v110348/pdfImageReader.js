import {recognizeDocumentText} from './webOcr.js';
import {checkCancelled} from './scanIntakeV110328.js';

// Use the same bounded cleanup/retry pipeline as photo intake. Load on demand
// because image classification also imports the higher-level document reader.
export async function readPdfImageV110348(file, options, pageNumber) {
  checkCancelled(options.signal);
  let reading;
  try {
    const {readImageDocumentV110323} = await import('./imageReaderV110323.js');
    checkCancelled(options.signal);
    reading = await readImageDocumentV110323(file, {
      signal: options.signal, onProgress: options.onProgress,
      fileName: file.name, scanMeta: {pageFiles: [file]},
    });
  } catch (error) {
    checkCancelled(options.signal);
  }
  checkCancelled(options.signal);
  const best = reading?.pages?.[0];
  if (best?.text?.trim()) {
    const ids = new Map((reading.ocrEvidenceV110323 || []).map(pass => [pass.id, `${pageNumber}-pdf-${pass.id}`]));
    const passes = (reading.ocrEvidenceV110323 || []).map(pass => ({
      ...pass, id: ids.get(pass.id), page: pageNumber,
      ...(pass.sourcePassId ? {sourcePassId: ids.get(pass.sourcePassId)} : {}),
    }));
    return {text: best.text, confidence: best.confidence, passes};
  }
  // A failed cleanup must not discard a readable original render.
  const raw = await recognizeDocumentText(file, {
    signal: options.signal, onProgress: options.onProgress,
    pageSegMode: '3', returnLayout: true, preserveSpaces: true, dpi: 300,
  });
  checkCancelled(options.signal);
  return {...raw, passes: raw?.text?.trim() ? [{
    ...raw, id: `${pageNumber}-pdf-source-fallback`, page: pageNumber, sourceImageFile: file,
  }] : []};
}
