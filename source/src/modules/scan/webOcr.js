const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
let scriptPromise = null;
let workerPromise = null;
let queue = Promise.resolve();
let activeProgress = () => {};

function loadScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('browser_required'));
  if (window.Tesseract?.createWorker) return Promise.resolve(window.Tesseract);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(script => script.src === TESSERACT_URL);
    const ready = () => window.Tesseract?.createWorker ? resolve(window.Tesseract) : reject(new Error('tesseract_not_ready'));
    if (existing) {
      if (window.Tesseract?.createWorker) return resolve(window.Tesseract);
      existing.addEventListener('load', ready, { once:true });
      existing.addEventListener('error', () => reject(new Error('tesseract_script_failed')), { once:true });
      return;
    }
    const script = document.createElement('script');
    script.src = TESSERACT_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = ready;
    script.onerror = () => reject(new Error('tesseract_script_failed'));
    document.head.appendChild(script);
  }).catch(error => {
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

async function worker() {
  const Tesseract = await loadScript();
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('eng', 1, {
      logger(message) {
        const status = String(message?.status || 'Reading text');
        const progress = Number.isFinite(Number(message?.progress)) ? Number(message.progress) : 0;
        activeProgress(progress, status);
      },
    }).then(async instance => {
      try {
        await instance.setParameters({
          preserve_interword_spaces:'1',
          user_defined_dpi:'300',
          tessedit_pageseg_mode:'11',
          tessedit_char_whitelist:'',
          tessedit_char_blacklist:'',
        });
      } catch {}
      return instance;
    }).catch(error => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

function runSerial(task) {
  const next = queue.then(task, task);
  queue = next.catch(() => {});
  return next;
}

function parseTsv(tsv = '') {
  const rows = String(tsv || '').trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) return { words:[], lines:[] };
  const words = [];
  const groups = new Map();

  for (const row of rows.slice(1)) {
    const parts = row.split('\t');
    if (parts.length < 11) continue;
    const [level, pageNum, blockNum, parNum, lineNum, wordNum, left, top, width, height, confidence, ...textParts] = parts;
    const text = textParts.join('\t').trim();
    if (Number(level) !== 5 || !text) continue;
    const word = {
      text,
      confidence:Number(confidence),
      left:Number(left),
      top:Number(top),
      width:Number(width),
      height:Number(height),
      right:Number(left) + Number(width),
      bottom:Number(top) + Number(height),
      page:Number(pageNum),
      block:Number(blockNum),
      paragraph:Number(parNum),
      line:Number(lineNum),
      word:Number(wordNum),
    };
    words.push(word);
    const key = `${pageNum}:${blockNum}:${parNum}:${lineNum}`;
    const group = groups.get(key) || { key, words:[], left:Infinity, top:Infinity, right:0, bottom:0, confidenceTotal:0, confidenceCount:0 };
    group.words.push(word);
    group.left = Math.min(group.left, word.left);
    group.top = Math.min(group.top, word.top);
    group.right = Math.max(group.right, word.right);
    group.bottom = Math.max(group.bottom, word.bottom);
    if (Number.isFinite(word.confidence) && word.confidence >= 0) {
      group.confidenceTotal += word.confidence;
      group.confidenceCount += 1;
    }
    groups.set(key, group);
  }

  const lines = [...groups.values()].map(group => ({
    text:group.words.sort((a, b) => a.left - b.left).map(word => word.text).join(' ').replace(/\s+/g, ' ').trim(),
    confidence:group.confidenceCount ? group.confidenceTotal / group.confidenceCount : 0,
    left:Number.isFinite(group.left) ? group.left : 0,
    top:Number.isFinite(group.top) ? group.top : 0,
    width:Math.max(0, group.right - group.left),
    height:Math.max(0, group.bottom - group.top),
    right:group.right,
    bottom:group.bottom,
  })).filter(line => line.text).sort((a, b) => a.top - b.top || a.left - b.left);

  return { words, lines };
}

export async function recognizeDocumentText(file, options = {}) {
  if (!String(file?.type || '').startsWith('image/')) return null;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const pageSegMode = String(options.pageSegMode || '11');
  const returnLayout = options.returnLayout === true;

  return runSerial(async () => {
    activeProgress = onProgress;
    try {
      const engine = await worker();
      try {
        await engine.setParameters({
          preserve_interword_spaces:options.preserveSpaces === false ? '0' : '1',
          user_defined_dpi:String(options.dpi || 300),
          tessedit_pageseg_mode:pageSegMode,
          tessedit_char_whitelist:String(options.charWhitelist || ''),
          tessedit_char_blacklist:String(options.charBlacklist || ''),
          ...(options.numericMode ? { classify_bln_numeric_mode:'1' } : {}),
        });
      } catch {}

      onProgress(0.03, 'Loading OCR model…');
      const recognizeOptions = options.rectangle ? { rectangle:options.rectangle } : {};
      const outputOptions = returnLayout ? { text:true, tsv:true } : { text:true };
      const result = await engine.recognize(file, recognizeOptions, outputOptions);
      const text = String(result?.data?.text || '').trim();
      const confidence = Number(result?.data?.confidence || 0) / 100;
      const layout = returnLayout ? parseTsv(result?.data?.tsv || '') : { words:[], lines:[] };
      return text ? {
        text,
        confidence,
        method:'web-ocr',
        pageSegMode,
        words:layout.words,
        lines:layout.lines,
      } : null;
    } finally {
      activeProgress = () => {};
    }
  });
}

export async function terminateWebOcr() {
  if (!workerPromise) return;
  try {
    const instance = await workerPromise;
    await instance.terminate();
  } catch {}
  workerPromise = null;
  queue = Promise.resolve();
}
