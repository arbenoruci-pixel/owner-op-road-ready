import { isPdfFileV100, readPdfTextV100 } from './pdfTextV100.js';

const PDFJS_MODULE_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
let pdfJsPromise = null;

function printable(value = '') {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function runtimeImport(url) {
  // Keep the large PDF.js runtime out of the main app bundle. The import is
  // pinned and runs only when the driver imports a PDF. The legacy local reader
  // remains the offline fallback when the module cannot be reached.
  const importer = new Function('moduleUrl', 'return import(moduleUrl)');
  return importer(url);
}

async function loadPdfJs() {
  if (typeof window === 'undefined') throw new Error('PDF.js requires the browser reader.');
  if (window.pdfjsLib?.getDocument) return window.pdfjsLib;
  if (!pdfJsPromise) {
    pdfJsPromise = runtimeImport(PDFJS_MODULE_URL).then(module => {
      const pdfjs = module?.getDocument ? module : module?.default;
      if (!pdfjs?.getDocument) throw new Error('PDF.js module did not load.');
      if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjs;
    }).catch(error => {
      pdfJsPromise = null;
      throw error;
    });
  }
  return pdfJsPromise;
}

function itemMetric(item = {}) {
  const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 1, 0, 0];
  const height = Math.max(1, Number(item.height || Math.hypot(Number(transform[2] || 0), Number(transform[3] || 0)) || Math.abs(Number(transform[3] || 0)) || 8));
  return {
    text:printable(item.str || ''),
    x:Number(transform[4] || 0),
    y:Number(transform[5] || 0),
    width:Math.max(0, Number(item.width || 0)),
    height,
    hasEOL:item.hasEOL === true,
  };
}

function rowText(items = []) {
  const ordered = [...items].sort((a, b) => a.x - b.x);
  let out = '';
  let lastRight = null;
  let lastHeight = 8;
  for (const item of ordered) {
    if (!item.text) continue;
    const averageChar = item.text.length ? Math.max(2, item.width / item.text.length) : 4;
    const gap = lastRight == null ? 0 : item.x - lastRight;
    const needsSpace = out && gap > Math.max(1.2, Math.min(8, (averageChar + lastHeight * .32) * .32));
    out += `${needsSpace ? ' ' : ''}${item.text}`;
    lastRight = item.x + item.width;
    lastHeight = item.height;
  }
  return printable(out);
}

function pageTextFromItems(rawItems = []) {
  const metrics = rawItems.map(itemMetric).filter(item => item.text);
  if (!metrics.length) return '';

  // PDF text items are not guaranteed to arrive in visual reading order.
  // Group by baseline and then sort left-to-right so labels stay beside values.
  const sorted = [...metrics].sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > Math.max(2, Math.min(a.height, b.height) * .3)) return yDiff;
    return a.x - b.x;
  });
  const rows = [];
  for (const item of sorted) {
    const tolerance = Math.max(2, Math.min(5, item.height * .38));
    let row = rows.find(candidate => Math.abs(candidate.y - item.y) <= Math.max(tolerance, candidate.tolerance));
    if (!row) {
      row = { y:item.y, tolerance, items:[] };
      rows.push(row);
    }
    row.items.push(item);
    row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length;
    row.tolerance = Math.max(row.tolerance, tolerance);
  }

  return printable(rows
    .sort((a, b) => b.y - a.y)
    .map(row => rowText(row.items))
    .filter(Boolean)
    .join('\n'));
}

function pageEvidence(text = '') {
  const value = String(text || '');
  const words = value.match(/[A-Za-z0-9$#][A-Za-z0-9$#.,'&/-]*/g) || [];
  const truckingLabels = value.match(/\b(?:order|leg|load|pickup|deliver|carrier|broker|rate|total pay|trailer|commodity|pieces|weight|gallons|invoice)\b/gi) || [];
  return { words:words.length, labels:truckingLabels.length };
}

export function isPdfFileV102(file) {
  return isPdfFileV100(file);
}

export async function readPdfTextV102(file, options = {}) {
  if (!isPdfFileV102(file)) return null;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

  try {
    onProgress(.04, 'Opening native PDF text layer…');
    const pdfjs = await loadPdfJs();
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > 75 * 1024 * 1024) throw new Error('PDF is larger than 75 MB.');
    const loadingTask = pdfjs.getDocument({
      data:new Uint8Array(buffer),
      isEvalSupported:false,
      useSystemFonts:true,
      stopAtErrors:false,
    });
    const pdf = await loadingTask.promise;
    const pages = [];
    let totalWords = 0;
    let totalLabels = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress(.08 + (pageNumber - 1) / Math.max(1, pdf.numPages) * .78, `Reading PDF page ${pageNumber} of ${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({ includeMarkedContent:true, disableNormalization:false });
      const text = pageTextFromItems(content?.items || []);
      const evidence = pageEvidence(text);
      totalWords += evidence.words;
      totalLabels += evidence.labels;
      pages.push({ pageNumber, text, wordCount:evidence.words, labelCount:evidence.labels });
      page.cleanup?.();
    }

    await pdf.destroy?.();
    const text = printable(pages.map(page => `[[PAGE:${page.pageNumber}]]\n${page.text}`).join('\n\n'));
    const reliable = totalWords >= 25 && (totalLabels >= 2 || totalWords >= 100);
    if (reliable) {
      onProgress(.94, `Native PDF text found on ${pages.filter(page => page.wordCount).length} page${pages.filter(page => page.wordCount).length === 1 ? '' : 's'}`);
      return {
        text,
        pages,
        pageCount:pdf.numPages,
        method:'pdfjs-native-text-v102',
        nativeText:true,
        wordCount:totalWords,
        labelCount:totalLabels,
      };
    }
  } catch (error) {
    onProgress(.18, 'Native PDF reader unavailable; trying local fallback…');
  }

  const fallback = await readPdfTextV100(file, { onProgress:(value, text) => onProgress(.2 + value * .72, text) });
  return {
    ...(fallback || {}),
    method:fallback?.text ? `pdfjs-fallback:${fallback.method || 'pdf-text-v100'}` : 'pdf-import-no-text',
    nativeText:false,
  };
}
