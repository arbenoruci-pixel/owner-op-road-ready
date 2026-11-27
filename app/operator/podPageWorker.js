import {processPhoto, renderCrop} from './podPageRenderer.js';

self.onmessage = async ({data}) => {
  try {
    const value = data.operation === 'crop'
      ? await renderCrop(data.file, data.rotation, data.corners)
      : await processPhoto(data.file, data.source, data.capture);
    self.postMessage({value});
  } catch (error) {
    self.postMessage({error: error.message || 'Could not process the POD photo.'});
  }
};
