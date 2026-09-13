import { scannerErrorV3 } from './scannerTypesV3.js';

function createCanvas(width, height) {
  if (typeof document === 'undefined' && typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width,height);
  if (typeof document === 'undefined') throw scannerErrorV3('canvas_unavailable', 'Document processing is unavailable on this device.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function imageElementFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(scannerErrorV3('image_decode_failed', 'The selected photo could not be opened.'));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function decodeImageFileV3(file, options = {}) {
  if (!file || !String(file.type || '').startsWith('image/')) throw scannerErrorV3('image_required', 'Choose a document photo.');
  let source = null;
  try {
    if (typeof createImageBitmap === 'function') source = await createImageBitmap(file, { imageOrientation:'from-image' });
  } catch {
    source = null;
  }
  if (!source) source = await imageElementFromFile(file);
  const sourceWidth = Number(source.width || source.naturalWidth || 0);
  const sourceHeight = Number(source.height || source.naturalHeight || 0);
  if (!sourceWidth || !sourceHeight) throw scannerErrorV3('image_dimensions_missing', 'The photo has no usable dimensions.');
  const maxDimension = Math.max(900, Number(options.maxDimension || 2800));
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d', { alpha:false, willReadFrequently:true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  if (typeof source.close === 'function') source.close();
  return context.getImageData(0, 0, width, height);
}

export function rotateImageDataClockwiseV3(image) {
  const out = new Uint8ClampedArray(image.width * image.height * 4);
  const outWidth = image.height;
  const outHeight = image.width;
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    const source = (y * image.width + x) * 4;
    const destinationX = image.height - 1 - y;
    const destinationY = x;
    const destination = (destinationY * outWidth + destinationX) * 4;
    out[destination] = image.data[source];
    out[destination + 1] = image.data[source + 1];
    out[destination + 2] = image.data[source + 2];
    out[destination + 3] = image.data[source + 3];
  }
  return { width:outWidth, height:outHeight, data:out };
}

export async function imageDataToFileV3(image, name = 'road-ready-document.jpg', quality = .94) {
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d', { alpha:false });
  const pixels = image instanceof ImageData ? image : new ImageData(image.data, image.width, image.height);
  context.putImageData(pixels, 0, 0);
  let exportCanvas = canvas;
  if(name.endsWith('-ocr.png') && Math.max(image.width,image.height)<2200){
    const scale=Math.min(2,3000/Math.max(image.width,image.height));
    exportCanvas=createCanvas(Math.round(image.width*scale),Math.round(image.height*scale));
    const up=exportCanvas.getContext('2d',{alpha:false});up.imageSmoothingEnabled=true;up.imageSmoothingQuality='high';up.drawImage(canvas,0,0,exportCanvas.width,exportCanvas.height);
  }
  const mimeType = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const blob = exportCanvas.convertToBlob ? await exportCanvas.convertToBlob({type:mimeType,quality}) : await new Promise(resolve => exportCanvas.toBlob(resolve, mimeType, quality));
  exportCanvas.width=exportCanvas.height=1;if(canvas!==exportCanvas)canvas.width=canvas.height=1;
  if (!blob) throw scannerErrorV3('jpeg_export_failed', 'The processed document could not be exported.');
  return new File([blob], name, { type:mimeType, lastModified:Date.now() });
}

export async function canvasToFileV3(canvas, name = 'road-ready-camera.jpg', quality = .95) {
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw scannerErrorV3('camera_export_failed', 'The camera image could not be saved.');
  return new File([blob], name, { type:'image/jpeg', lastModified:Date.now() });
}

export function objectUrlV3(file) {
  return file ? URL.createObjectURL(file) : '';
}
