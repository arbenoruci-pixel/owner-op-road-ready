import {nativePdfLayout} from '../../packages/smart-reader-core/src/pdfLayout.js';
import {maintenanceItemRegion, suppressItemGrid} from './maintenanceReceiptItems.js';
import {includesFreightPage} from './maintenanceReceiptEvidence.js';
import {readSkewedThermalReceipt} from './thermalReceipt.js';
import {readSmallPrintHeader} from './maintenanceHeaderRegion.js';
import {readSmallPrintTotal,readRuledTax} from './maintenanceSmallPrint.js';
import {readExportedReceiptPhotos} from './exportedReceiptPhotos.js';
import {getReceiptPhotoSource,getReceiptPhotos} from './maintenanceReceiptPhotos.js';

const maxPages = 8;

// Upsample small print only for the local OCR retry. The saved image stays
// untouched and the transient canvas is bounded on older phones.
async function scaleForReading(file, region) {
  const url = URL.createObjectURL(file);
  const canvas = document.createElement('canvas');
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const area = region || {left:0,top:0,width:1,height:1};
    const left = Math.floor(image.naturalWidth*area.left);
    const top = Math.floor(image.naturalHeight*area.top);
    const width = Math.min(image.naturalWidth-left, Math.ceil(image.naturalWidth*area.width));
    const height = Math.min(image.naturalHeight-top, Math.ceil(image.naturalHeight*area.height));
    const scale = Math.min(region ? 4 : 2.3, (region ? 4000 : 3200)/Math.max(width,height),
      Math.sqrt((region ? 2400000 : 6000000)/(width*height)));
    canvas.width = Math.max(1, Math.round(width*scale));
    canvas.height = Math.max(1, Math.round(height*scale));
    const context = canvas.getContext('2d',{alpha:false});
    context.fillStyle = 'white';
    context.fillRect(0,0,canvas.width,canvas.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, left, top, width, height, 0, 0, canvas.width, canvas.height);
    if (region) {
      const itemPixels = context.getImageData(0,0,canvas.width,canvas.height);
      suppressItemGrid(itemPixels);
      context.putImageData(itemPixels,0,0);
    }
    const pixels = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
    if (!pixels) throw new Error('Photo pixels unavailable');
    return pixels;
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 1;
  }
}

function positionItemRead(read, area, imageSize) {
  const scaleX = imageSize.width*area.width/read.imageSize.width;
  const scaleY = imageSize.height*area.height/read.imageSize.height;
  const position = word => {
    const left = area.left*imageSize.width + word.left*scaleX;
    const top = area.top*imageSize.height + word.top*scaleY;
    const width = word.width*scaleX, height = word.height*scaleY;
    return {...word,left,top,width,height,right:left+width,bottom:top+height};
  };
  return {...read,region:'items',imageSize,words:read.words.map(position),lines:read.lines.map(position)};
}

async function readPhoto(file, {signal, progress}) {
  const {recognizeDocumentText} = await import('../../scripts/v110383/webOcr.js');
  const read = await recognizeDocumentText(file, {signal, onProgress:value => progress(value*.40), pageSegMode:'6', returnLayout:true});
  const primary = read || {text:'',lines:[],words:[]};
  const lines = primary.lines?.length ? primary.lines : primary.text.split(/\r?\n/).map(text => ({text, confidence:100 * primary.confidence}));
  const page = {...primary,lines,source:'ocr'};
  const hasClearTotal = lines.some(row => row.confidence >= 80 && /^(?:(?:invoice|grand)\s+)?total\s*[:$ ]*\d[\d,]*\.\d{2}\s*$/i.test(row.text));
  // A sparse pass separates prices, quantities and the final total on grid
  // forms. Reuse the primary result for clearly readable simple receipts.
  if (includesFreightPage([page])) return page;
  const {parseMaintenanceReceipt} = await import('./maintenanceReceiptFields.js');
  const initial = hasClearTotal && parseMaintenanceReceipt([page]);
  if (!initial || !initial.vendor || !initial.date || initial.totalCents == null) {
    try {
      const pixels = await scaleForReading(file);
      signal?.throwIfAborted();
      const sparse = await recognizeDocumentText(pixels,{signal,pageSegMode:'11',returnLayout:true,onProgress:value => progress(.40+value*.45)});
      if (sparse?.text?.trim()) {
        if (!primary.text.trim()) Object.assign(page,sparse);
        else page.supplemental = [sparse];
        const area = maintenanceItemRegion(page);
        if (area && sparse.imageSize) {
          const crop = await scaleForReading(file, area);
          const itemRead = await recognizeDocumentText(crop,{signal,pageSegMode:'6',returnLayout:true,onProgress:value => progress(.85+value*.15)});
          if (itemRead?.imageSize && itemRead.words?.length) (page.supplemental ||= []).push(positionItemRead(itemRead,area,sparse.imageSize));
        }
      }
    } catch {
      signal?.throwIfAborted();
    }
  }
  if (!includesFreightPage([page])) {
    try { await readSmallPrintHeader(file,page,recognizeDocumentText,{signal}); }
    catch { signal?.throwIfAborted(); }
    await readSkewedThermalReceipt(file,page,recognizeDocumentText,{signal,progress});
    try {
      let receipt = parseMaintenanceReceipt([page]);
      if (receipt.printedTotalCents == null && !receipt.conflictFields?.includes('totalCents')) {
        await readSmallPrintTotal(file,page,recognizeDocumentText,{signal});
        receipt = parseMaintenanceReceipt([page]);
      }
      if (!receipt.conflictFields?.includes('taxCents')) {
        await readRuledTax(file,page,receipt,recognizeDocumentText,{signal});
      }
    } catch { signal?.throwIfAborted(); }
  }
  if (!page.text?.trim() && !page.lines?.length && !page.supplemental?.some(read => read.text?.trim() || read.lines?.length)) {
    throw new Error('No readable text');
  }
  return page;
}

function nativeRows(parts) {
  const rows = [];
  for (const item of parts) {
    const last = rows.at(-1);
    if (last && Math.abs(last.top - item.top) < Math.min(last.height, item.height) * .45) {
      last.text += ' ' + item.text;
    } else rows.push({...item});
  }
  return rows;
}

async function readReviewedPhoto(photo, options) {
  const source = getReceiptPhotoSource(photo);
  let page;
  try { page = await readPhoto(photo,options); }
  catch (error) { options.signal?.throwIfAborted(); if (!source) throw error; }
  if (!page) {
    const {receiptSourcePixels} = await import('roadready-pod-scanner');
    return readPhoto(await receiptSourcePixels(source),options);
  }
  if (!source || includesFreightPage([page])) return page;
  const {parseMaintenanceReceipt} = await import('./maintenanceReceiptFields.js');
  const first = parseMaintenanceReceipt([page]);
  if (first.totalCents != null && first.vendor && first.date) return page;
  try {
    const {receiptSourcePixels} = await import('roadready-pod-scanner');
    const raw = await receiptSourcePixels(source);
    options.signal?.throwIfAborted();
    if (!raw || raw === photo) return page;
    const alternative = await readPhoto(raw,options);
    if (includesFreightPage([alternative])) return alternative;
    if (source.allowFull && parseMaintenanceReceipt([alternative]).totalCents == null) {
      const {recognizeDocumentText} = await import('../../scripts/v110383/webOcr.js');
      // Keep new observations even when they identify only one field.
      await readSkewedThermalReceipt(source.original,alternative,recognizeDocumentText,options);
    }
    const alternateResult = parseMaintenanceReceipt([alternative]);
    const score = r => Number(r.totalCents != null)*3 + Number(Boolean(r.vendor)) +
      Number(Boolean(r.date)) + Number(Boolean(r.lines.length));
    const [best,other] = score(alternateResult)>score(first) ? [alternative,page] : [page,alternative];
    const suggestions = [...new Set([page.suggestedTotalCents,alternative.suggestedTotalCents].filter(Number.isSafeInteger))];
    if ([first.printedTotalCents,alternateResult.printedTotalCents].some(value=>Number.isSafeInteger(value) && value!==suggestions[0])) suggestions.length = 0;
    return {...best,suggestedTotalCents:suggestions.length===1 ? suggestions[0] : null,
      supplemental:[...(best.supplemental || []),other,...(other.supplemental || [])]};
  } catch {
    options.signal?.throwIfAborted();
    return page;
  }
}

async function reviewImageFile(file, options) {
  // The file picker may contain a raw camera image. Analyze the same page
  // geometry as the scanner, while retaining the driver's original upload.
  let photo = file;
  try {
    const {prepareReceiptImage} = await import('roadready-pod-scanner');
    options.signal?.throwIfAborted();
    photo = await prepareReceiptImage(file);
  } catch { options.signal?.throwIfAborted(); }
  return readReviewedPhoto(photo,options);
}

async function readPdfPage(page, options) {
  const viewport = page.getViewport({scale:1});
  const words = nativePdfLayout(await page.getTextContent(), viewport);
  const rows = nativeRows(words);
  const native = {lines:rows,words,imageSize:{width:viewport.width,height:viewport.height},source:'native-pdf'};
  const text = rows.map(row => row.text).join('\n');
  // A scan can have a native text overlay containing only a page number,
  // header or watermark. Read the printed page when that layer lacks detail.
  if (text.length >= 35 && rows.length >= 3 && /\d[\d,]*\.\d{2}\b/.test(text)) {
    return {...native,text};
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
    if (text.trim()) return {...native,text,incomplete:true};
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
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  const scannerPhotos = getReceiptPhotos(file);
  const photos = scannerPhotos || (isPdf ? await readExportedReceiptPhotos(file) : null);
  const pages = [];
  const issues = [];
  let pdf, loading;
  const cancel = () => { loading?.destroy().catch(() => {}); };
  try {
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
        const result = page ? await readPdfPage(page, options) : photos ? await readReviewedPhoto(photos[i], options) : await reviewImageFile(file,options);
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
    const candidate = pages.length === 1 && pages[0].suggestedTotalCents;
    if (Number.isSafeInteger(candidate) && receipt.printedTotalCents == null &&
        !issues.length && !receipt.partialRead && !receipt.foreignCurrency && !receipt.multipleInvoices &&
        !receipt.conflictFields?.includes('totalCents')) {
      receipt.suggestedTotalCents = candidate;
    }
    if (issues.length) { receipt.partialRead = true; receipt.totalCents = null; }
    receipt.issues = [...issues, ...receipt.issues];
    // The review shows counts and stages only. Receipt text and identifiers
    // stay out of diagnostics, storage and network requests.
    const observations = pages.flatMap(page => [page,...(page.supplemental || [])]);
    receipt.scanDetails = {
      source:scannerPhotos ? 'Scanner' : photos ? 'Saved scan PDF' : isPdf ? 'PDF' : 'Photo',
      pagesRead:pages.length, pagesTotal:count, observations:observations.length,
      rectified:observations.some(read => read.region === 'thermal' || read.region === 'thermal-partial'),
      native:pages.some(page => page.source === 'native-pdf'),
    };
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
