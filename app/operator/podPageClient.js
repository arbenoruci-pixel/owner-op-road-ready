import {processPhoto, renderCrop} from './podPageRenderer.js';

export {preparePodCrop} from './podPageRenderer.js';

// A per-page worker releases all decoded pixels when its result is returned.
// Some phones can decode a camera format on the main thread only.
async function runJob(job, fallback) {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    return fallback();
  }
  let worker, timer;
  try {
    return await new Promise((resolve, reject) => {
      worker = new Worker(new URL('./podPageWorker.js', import.meta.url), {type: 'module'});
      timer = setTimeout(() => reject(new Error('Photo worker timed out')), 20000);
      worker.onmessage = ({data}) => data.error ? reject(new Error(data.error)) : resolve(data.value);
      worker.onerror = () => reject(new Error('Photo worker unavailable'));
      worker.onmessageerror = () => reject(new Error('Photo worker result unavailable'));
      worker.postMessage(job);
    });
  } catch {
    // Retry with the browser's main-thread decoder after the worker is released.
  } finally {
    clearTimeout(timer);
    worker?.terminate();
  }
  return fallback();
}

export function processPodPage(file, source, capture = null) {
  return runJob({operation: 'photo', file, source, capture}, () => processPhoto(file, source, capture));
}

export function finalizePodCrop(session, corners) {
  const {originalFile: file, rotation, workingImage} = session;
  return runJob({operation: 'crop', file, rotation, corners}, () => renderCrop(file, rotation, corners, workingImage));
}
