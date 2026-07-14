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

export async function recognizeDocumentText(file, options = {}) {
  if (!String(file?.type || '').startsWith('image/')) return null;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const pageSegMode = String(options.pageSegMode || '11');
  return runSerial(async () => {
    activeProgress = onProgress;
    try {
      const engine = await worker();
      try {
        await engine.setParameters({
          preserve_interword_spaces:'1',
          user_defined_dpi:'300',
          tessedit_pageseg_mode:pageSegMode,
        });
      } catch {}
      onProgress(0.03, 'Loading OCR model…');
      const result = await engine.recognize(file);
      const text = String(result?.data?.text || '').trim();
      const confidence = Number(result?.data?.confidence || 0) / 100;
      return text ? { text, confidence, method:'web-ocr', pageSegMode } : null;
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
