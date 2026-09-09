const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
let scriptPromise = null;
let workerPromise = null;
let queue = Promise.resolve();
let activeProgress = () => {};
let resultCache = new WeakMap();
function bounded(promise, ms, code) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(code)), ms);
  })]).finally(() => clearTimeout(timer));
}

function loadScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('browser_required'));
  if (window.Tesseract?.createWorker) return Promise.resolve(window.Tesseract);
  if (scriptPromise) return scriptPromise;
  let scriptElement;
  const pending = new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(script => script.src === TESSERACT_URL);
    const ready = () => window.Tesseract?.createWorker ? resolve(window.Tesseract) : reject(new Error('tesseract_not_ready'));
    if (existing) {
      scriptElement = existing;
      if (window.Tesseract?.createWorker) return resolve(window.Tesseract);
      existing.addEventListener('load', ready, { once:true });
      existing.addEventListener('error', () => reject(new Error('tesseract_script_failed')), { once:true });
      return;
    }
    const script = document.createElement('script');
    scriptElement = script;
    script.src = TESSERACT_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = ready;
    script.onerror = () => reject(new Error('tesseract_script_failed'));
    document.head.appendChild(script);
  });
  scriptPromise = bounded(pending, 20000, 'ocr_download_timeout').catch(error => {
    scriptElement?.remove();
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

async function worker() {
  const Tesseract = await loadScript();
  if (!workerPromise) {
    const pendingWorker = Tesseract.createWorker('eng', 1, {
      logger(message) {
        const status = String(message?.status || 'Reading text');
        const progress = Number.isFinite(Number(message?.progress)) ? Number(message.progress) : 0;
        activeProgress(progress, status);
      },
    });
    workerPromise = bounded(pendingWorker, 45000, 'ocr_model_timeout').then(async instance => {
      try {
        await bounded(instance.setParameters({
          preserve_interword_spaces:'1',
          user_defined_dpi:'300',
          tessedit_pageseg_mode:'11',
          tessedit_char_whitelist:'',
          tessedit_char_blacklist:'',
        }), 8000, 'ocr_parameters_timeout');
      } catch {}
      return instance;
    }).catch(error => {
      pendingWorker.then(instance => instance.terminate()).catch(() => {});
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
  const cacheKey = JSON.stringify([pageSegMode,returnLayout,options.rectangle||null,options.dpi||300,options.preserveSpaces!==false,options.charWhitelist||'',options.charBlacklist||'',Boolean(options.numericMode)]);
  const cached = resultCache.get(file)?.get(cacheKey);
  if (cached) { onProgress(1, 'Using text already read from this image'); return cached; }

  const task = runSerial(async () => {
    activeProgress = onProgress;
    let engine;
    try {
      engine = await worker();
      try {
        await bounded(engine.setParameters({
          preserve_interword_spaces:options.preserveSpaces === false ? '0' : '1',
          user_defined_dpi:String(options.dpi || 300),
          tessedit_pageseg_mode:pageSegMode,
          tessedit_char_whitelist:String(options.charWhitelist || ''),
          tessedit_char_blacklist:String(options.charBlacklist || ''),
          classify_bln_numeric_mode:options.numericMode ? '1' : '0',
        }), 8000, 'ocr_parameters_timeout');
      } catch {}

      onProgress(0.03, 'Loading OCR model…');
      const recognizeOptions = options.rectangle ? { rectangle:options.rectangle } : {};
      const outputOptions = returnLayout ? { text:true, tsv:true } : { text:true };
      const result = await bounded(engine.recognize(file, recognizeOptions, outputOptions), 35000, 'ocr_read_timeout');
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
    } catch (error) {
      if (engine) {
        workerPromise = null;
        try { await bounded(engine.terminate(), 2000, 'ocr_stop_timeout'); } catch {}
      }
      throw error;
    } finally {
      activeProgress = () => {};
    }
  });
  let entries=resultCache.get(file);
  if(!entries){entries=new Map();resultCache.set(file,entries);}
  entries.set(cacheKey,task);
  task.catch(()=>{if(entries.get(cacheKey)===task)entries.delete(cacheKey);});
  return task;
}

export async function terminateWebOcr() {
  resultCache = new WeakMap();
  if (!workerPromise) return;
  try {
    const instance = await workerPromise;
    await instance.terminate();
  } catch {}
  workerPromise = null;
  queue = Promise.resolve();
}
