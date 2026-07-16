import {
  canvasToFile,
  fileToImage,
  loadDocumentVision,
  renderDocumentFile,
} from './documentScannerEngine.js';

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function wait(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sourceSize(source) {
  return {
    width:Number(source?.videoWidth || source?.naturalWidth || source?.width || 0),
    height:Number(source?.videoHeight || source?.naturalHeight || source?.height || 0),
  };
}

function scaledDimensions(width, height, options = {}) {
  const long = Math.max(width, height, 1);
  const short = Math.max(1, Math.min(width, height));
  const maxDimension = Number(options.maxDimension || 4600);
  const minShortSide = Number(options.minShortSide || 1500);
  const upper = maxDimension / long;
  const lower = Math.max(1, minShortSide / short);
  const scale = Math.max(.1, Math.min(2.6, upper, lower));
  return {
    width:Math.max(2, Math.round(width * scale)),
    height:Math.max(2, Math.round(height * scale)),
    scale,
  };
}

function canvasFromSource(source, options = {}) {
  const size = sourceSize(source);
  if (!size.width || !size.height) throw new Error('source_dimensions_missing');
  const target = scaledDimensions(size.width, size.height, options);
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext('2d', { alpha:false, willReadFrequently:true });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function scoreDocumentCanvasV1030(canvas) {
  if (!canvas?.width || !canvas?.height) return {
    score:-1,
    brightness:0,
    contrast:0,
    sharpness:0,
    edgeDensity:0,
    glare:1,
    clipped:1,
    resolution:0,
  };
  const context = canvas.getContext('2d', { willReadFrequently:true });
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const step = Math.max(1, Math.floor(Math.max(canvas.width, canvas.height) / 720));
  const rowStride = canvas.width * 4;
  let count = 0;
  let sum = 0;
  let sumSq = 0;
  let gradient = 0;
  let edges = 0;
  let glare = 0;
  let clipped = 0;
  let dark = 0;
  for (let y = step; y < canvas.height - step; y += step) {
    for (let x = step; x < canvas.width - step; x += step) {
      const index = (y * canvas.width + x) * 4;
      const gray = (data[index] * .299) + (data[index + 1] * .587) + (data[index + 2] * .114);
      const rightIndex = index + (step * 4);
      const downIndex = index + (step * rowStride);
      const right = (data[rightIndex] * .299) + (data[rightIndex + 1] * .587) + (data[rightIndex + 2] * .114);
      const down = (data[downIndex] * .299) + (data[downIndex + 1] * .587) + (data[downIndex + 2] * .114);
      const localGradient = (Math.abs(gray - right) + Math.abs(gray - down)) / 2;
      sum += gray;
      sumSq += gray * gray;
      gradient += localGradient;
      if (localGradient > 18) edges += 1;
      if (gray > 248) glare += 1;
      if (gray > 252 || gray < 4) clipped += 1;
      if (gray < 22) dark += 1;
      count += 1;
    }
  }
  const brightness = count ? sum / count : 0;
  const contrast = count ? Math.sqrt(Math.max(0, (sumSq / count) - (brightness * brightness))) : 0;
  const sharpness = count ? gradient / count : 0;
  const edgeDensity = count ? edges / count : 0;
  const glareRatio = count ? glare / count : 1;
  const clippedRatio = count ? clipped / count : 1;
  const darkRatio = count ? dark / count : 1;
  const megapixels = (canvas.width * canvas.height) / 1_000_000;
  const resolution = clamp(Math.log2(megapixels + 1) / 2.8);
  const exposure = 1 - clamp(Math.abs(brightness - 158) / 150);
  const contrastScore = clamp(contrast / 68);
  const sharpnessScore = clamp(sharpness / 30);
  const edgeScore = clamp(edgeDensity / .18);
  const glarePenalty = clamp(glareRatio / .075);
  const clippedPenalty = clamp(clippedRatio / .15);
  const darkPenalty = clamp(darkRatio / .34);
  const score = (
    sharpnessScore * .34
    + contrastScore * .18
    + exposure * .14
    + edgeScore * .15
    + resolution * .19
    - glarePenalty * .24
    - clippedPenalty * .10
    - darkPenalty * .08
  );
  return {
    score,
    brightness,
    contrast,
    sharpness,
    edgeDensity,
    glare:glareRatio,
    clipped:clippedRatio,
    dark:darkRatio,
    resolution,
    megapixels,
    width:canvas.width,
    height:canvas.height,
    good:score >= .48 && sharpness >= 9.5 && glareRatio <= .12 && brightness >= 45 && brightness <= 232,
  };
}

export function chooseBestCaptureCandidateV1030(candidates = []) {
  return [...candidates].filter(candidate => candidate?.canvas && Number.isFinite(candidate?.quality?.score))
    .sort((a, b) => (
      Number(b.quality.score || 0) - Number(a.quality.score || 0)
      || Number(b.quality.megapixels || 0) - Number(a.quality.megapixels || 0)
    ))[0] || null;
}

async function candidateFromSource(source, kind, options = {}) {
  const canvas = canvasFromSource(source, {
    maxDimension:options.maxDimension || 5200,
    minShortSide:options.minShortSide || 0,
  });
  return { kind, canvas, quality:scoreDocumentCanvasV1030(canvas) };
}

async function highResolutionPhotoCandidate(track, options = {}) {
  if (typeof window === 'undefined' || typeof window.ImageCapture !== 'function' || !track) return null;
  try {
    const capture = new window.ImageCapture(track);
    const blob = await capture.takePhoto();
    if (!blob?.size) return null;
    const image = await fileToImage(blob);
    return candidateFromSource(image, 'high-resolution-photo', options);
  } catch {
    return null;
  }
}

export async function captureBestDocumentFileV1030(video, track, name = `road-ready-capture-${Date.now()}.jpg`, options = {}) {
  if (!video?.videoWidth || !video?.videoHeight) throw new Error('camera_not_ready');
  const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
  const candidates = [];
  onStatus('Capturing the sharpest frame…');

  for (let index = 0; index < 3; index += 1) {
    if (index) await wait(90);
    try {
      candidates.push(await candidateFromSource(video, `video-burst-${index + 1}`, {
        maxDimension:4200,
        minShortSide:0,
      }));
    } catch {}
  }

  const photo = await highResolutionPhotoCandidate(track, {
    maxDimension:5600,
    minShortSide:0,
  });
  if (photo) candidates.push(photo);

  const best = chooseBestCaptureCandidateV1030(candidates);
  if (!best) throw new Error('capture_failed');
  onStatus(best.quality.good ? 'Sharp frame selected' : 'Best available frame selected');
  const file = await canvasToFile(best.canvas, name, 'image/jpeg', .985);
  return {
    file,
    diagnostics:{
      version:'v1030',
      candidateCount:candidates.length,
      selected:best.kind,
      quality:best.quality,
      candidates:candidates.map(candidate => ({ kind:candidate.kind, quality:candidate.quality })),
    },
  };
}

function odd(value, min = 31, max = 121) {
  let output = Math.max(min, Math.min(max, Math.round(value)));
  if (output % 2 === 0) output += 1;
  return Math.min(max % 2 === 1 ? max : max - 1, output);
}

async function fallbackVariants(file, onStatus) {
  const variants = [];
  const specs = [
    { id:'normalized', filter:'ocr', label:'Shadow-normalized text', quality:.985 },
    { id:'adaptive', filter:'bw', label:'High-contrast text', quality:.985 },
    { id:'color', filter:'color', label:'Clean color', quality:.98 },
  ];
  for (const spec of specs) {
    try {
      onStatus?.(`Building ${spec.label.toLowerCase()}…`);
      const output = await renderDocumentFile(file, {
        filter:spec.filter,
        maxDimension:4400,
        quality:spec.quality,
        name:`road-ready-v1030-${spec.id}-${Date.now()}.jpg`,
      });
      variants.push({ ...spec, file:output, method:'canvas-fallback' });
    } catch {}
  }
  return variants;
}

export async function buildOcrVariantsV1030(file, options = {}) {
  if (!String(file?.type || '').startsWith('image/')) return [];
  const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
  let image;
  try {
    image = await fileToImage(file);
  } catch {
    return fallbackVariants(file, onStatus);
  }
  const base = canvasFromSource(image, {
    maxDimension:options.maxDimension || 4600,
    minShortSide:options.minShortSide || 1600,
  });
  let cv;
  try {
    ({ cv } = await loadDocumentVision(onStatus));
  } catch {
    return fallbackVariants(file, onStatus);
  }

  const src = cv.imread(base);
  const gray = new cv.Mat();
  const background = new cv.Mat();
  const normalized = new cv.Mat();
  const contrast = new cv.Mat();
  const soft = new cv.Mat();
  const sharpened = new cv.Mat();
  const adaptive = new cv.Mat();
  let clahe = null;
  const variants = [];
  try {
    onStatus('Flattening shadows and paper color…');
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const backgroundKernel = odd(Math.min(base.width, base.height) / 20, 41, 151);
    cv.GaussianBlur(gray, background, new cv.Size(backgroundKernel, backgroundKernel), 0, 0, cv.BORDER_DEFAULT);
    cv.divide(gray, background, normalized, 255);
    if (typeof cv.CLAHE === 'function') {
      clahe = new cv.CLAHE(2.8, new cv.Size(8, 8));
      clahe.apply(normalized, contrast);
    } else {
      cv.equalizeHist(normalized, contrast);
    }
    cv.GaussianBlur(contrast, soft, new cv.Size(0, 0), 1.05);
    cv.addWeighted(contrast, 1.78, soft, -.78, 8, sharpened);

    const normalizedCanvas = document.createElement('canvas');
    normalizedCanvas.width = base.width;
    normalizedCanvas.height = base.height;
    cv.imshow(normalizedCanvas, sharpened);
    const normalizedFile = await canvasToFile(normalizedCanvas, `road-ready-v1030-normalized-${Date.now()}.jpg`, 'image/jpeg', .985);
    variants.push({
      id:'normalized',
      label:'Shadow-normalized text',
      file:normalizedFile,
      method:'opencv-background-clahe-unsharp',
      quality:scoreDocumentCanvasV1030(normalizedCanvas),
    });

    onStatus('Building adaptive text layer…');
    const thresholdBlock = odd(Math.min(base.width, base.height) / 42, 31, 81);
    cv.adaptiveThreshold(sharpened, adaptive, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, thresholdBlock, 11);
    const adaptiveCanvas = document.createElement('canvas');
    adaptiveCanvas.width = base.width;
    adaptiveCanvas.height = base.height;
    cv.imshow(adaptiveCanvas, adaptive);
    const adaptiveFile = await canvasToFile(adaptiveCanvas, `road-ready-v1030-adaptive-${Date.now()}.png`, 'image/png', 1);
    variants.push({
      id:'adaptive',
      label:'Adaptive black and white',
      file:adaptiveFile,
      method:'opencv-adaptive-gaussian',
      quality:scoreDocumentCanvasV1030(adaptiveCanvas),
    });

    onStatus('Building clean color reference…');
    const colorFile = await renderDocumentFile(file, {
      filter:'color',
      maxDimension:4600,
      quality:.985,
      name:`road-ready-v1030-color-${Date.now()}.jpg`,
    });
    variants.push({
      id:'color',
      label:'Clean color reference',
      file:colorFile,
      method:'percentile-color-normalization',
      quality:scoreDocumentCanvasV1030(base),
    });
    return variants;
  } catch {
    return fallbackVariants(file, onStatus);
  } finally {
    try { clahe?.delete?.(); } catch {}
    src.delete();
    gray.delete();
    background.delete();
    normalized.delete();
    contrast.delete();
    soft.delete();
    sharpened.delete();
    adaptive.delete();
  }
}
