import {nativePdfLayout} from '../../packages/smart-reader-core/src/pdfLayout.js';
import {getReceiptPhotos} from './maintenanceReceiptPhotos.js';

const maxPages = 8;

async function readPhoto(file, {signal, progress}) {
  const {recognizeDocumentText} = await import('../../scripts/v110383/webOcr.js');
  const read = await recognizeDocumentText(file, {signal, onProgress:progress, pageSegMode:'6', returnLayout:true});
  if (!read?.text?.trim()) throw new Error('No readable text');
  // Tesseract sometimes omits the TSV grid for a readable image.
  const lines = read.lines?.length ? read.lines : read.text.split(/\r?\n/).map(text => ({text, confidence:100 * read.confidence}));
  return {text:read.text, lines, source:'ocr'};
}

function nativeRows(content, viewport) {
  const parts = nativePdfLayout(content, viewport);
  const rows = [];
  for (const item of parts) {
    const last = rows.at(-1);
    if (last && Math.abs(last.top - item.top) < Math.min(last.height, item.height) * .45) {
      last.text += ' ' + item.text;
    } else rows.push({...item});
  }
  return rows;
}

async function readPdfPage(page, options) {
  const viewport = page.getViewport({scale:1});
  const rows = nativeRows(await page.getTextContent(), viewport);
  const text = rows.map(row => row.text).join('\n');
  // A scan can have a native text overlay containing only a page number,
  // header or watermark. Read the printed page when that layer lacks detail.
  if (text.length >= 35 && rows.length >= 3 && /\d[\d,]*\.\d{2}\b/.test(text)) {
    return {text, lines:rows, source:'native-pdf'};
  }
  const canvas = document.createElement('canvas');
  const raster = page.getViewport({scale:Math.min(4, 2400 / Math.max(viewport.width, viewport.height))});
  canvas.width = Math.ceil(raster.width);
  canvas.height = Math.ceil(raster.height);
  let render;
  const stop = () => render?.cancel();
  try {
    options.signal?.throwIfAborted();
    options.signal?.addEventListener('abort', stop, {once:true});
    render = page.render({canvasContext:canvas.getContext('2d', {alpha:false}), viewport:raster});
    await render.promise;
    const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!image) throw new Error('Could not read image');
    return await readPhoto(image, options);
  } catch (error) {
    options.signal?.throwIfAborted();
    if (text.trim()) return {text, lines:rows, source:'native-pdf', incomplete:true};
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', stop);
    canvas.width = canvas.height = 1;
  }
}

async function openPdf(file) {
  // Both the JS and its matching worker are emitted with the release; the
  // receipt bytes are passed directly to PDF.js on this device.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()), isEvalSupported:false, useSystemFonts:true});
}

export async function readMaintenanceReceipt(file, {signal, onProgress = () => {}} = {}) {
  if (!file?.size) throw new Error('Select a receipt first.');
  signal?.throwIfAborted();
  const photos = getReceiptPhotos(file);
  const pages = [];
  const issues = [];
  let pdf, loading;
  const cancel = () => { loading?.destroy().catch(() => {}); };
  try {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (!photos && isPdf) {
      onProgress(0, 'Opening receipt PDF…');
      loading = await openPdf(file);
      signal?.throwIfAborted();
      signal?.addEventListener('abort', cancel, {once:true});
      pdf = await loading.promise;
    } else if (!photos && !/^image\//.test(file.type)) {
      throw new Error('Choose a receipt photo or PDF.');
    }
    const count = photos?.length || pdf?.numPages || 1;
    const end = Math.min(count, maxPages);
    if (count > end) issues.push(`Only the first ${end} of ${count} pages were read. Check the full original before saving.`);
    for (let i = 0; i < end; i++) {
      signal?.throwIfAborted();
      const progress = value => onProgress((i + Math.min(1, Math.max(0, value || 0))) / end, `Reading receipt page ${i + 1} of ${count}…`);
      progress(0);
      let page;
      try {
        const options = {signal, progress};
        if (pdf) page = await pdf.getPage(i + 1);
        const result = page ? await readPdfPage(page, options) : await readPhoto(photos?.[i] || file, options);
        pages.push({...result, number:i + 1});
        if (result.incomplete) issues.push(`Only some text on page ${i + 1} could be read. Check the original.`);
      } catch {
        signal?.throwIfAborted();
        issues.push(`Page ${i + 1} could not be read. Check the original and enter its details manually.`);
      } finally { page?.cleanup(); }
    }
    signal?.throwIfAborted();
    const {parseMaintenanceReceipt} = await import('./maintenanceReceiptFields.js');
    const receipt = parseMaintenanceReceipt(pages);
    if (issues.length) { receipt.partialRead = true; receipt.totalCents = null; }
    receipt.issues = [...issues, ...receipt.issues];
    onProgress(1, 'Receipt ready for review');
    return receipt;
  } catch (error) {
    signal?.throwIfAborted();
    if (!loading && !photos && !/\.pdf$/i.test(file.name || '') && !/^image\/|^application\/pdf$/.test(file.type)) throw error;
    throw new Error('The receipt could not be read. You can keep the original and enter the details manually.');
  } finally {
    signal?.removeEventListener('abort', cancel);
    if (loading) await loading.destroy().catch(() => {});
  }
}
