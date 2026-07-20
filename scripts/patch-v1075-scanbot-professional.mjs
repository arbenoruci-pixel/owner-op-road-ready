import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
};

const adapter = `const SCANBOT_VERSION_V1075 = '9.0.0';
const SCANBOT_SCRIPT_V1075 = 'https://cdn.jsdelivr.net/npm/scanbot-web-sdk@9.0.0/bundle/ScanbotSDK.min.js';
const SCANBOT_ENGINE_V1075 = 'https://cdn.jsdelivr.net/npm/scanbot-web-sdk@9.0.0/bundle/bin/document-scanner/';
let sdkPromiseV1075 = null;

function timeoutV1075(promise, milliseconds, code) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(code)), milliseconds)),
  ]);
}

function loadScriptV1075() {
  if (typeof window === 'undefined') return Promise.reject(new Error('scanbot_browser_required'));
  if (window.ScanbotSDK) return Promise.resolve(window.ScanbotSDK);
  const existing = document.querySelector('script[data-road-ready-scanbot="1075"]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(window.ScanbotSDK), { once:true });
      existing.addEventListener('error', () => reject(new Error('scanbot_script_failed')), { once:true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCANBOT_SCRIPT_V1075;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.roadReadyScanbot = '1075';
    script.onload = () => window.ScanbotSDK ? resolve(window.ScanbotSDK) : reject(new Error('scanbot_global_missing'));
    script.onerror = () => reject(new Error('scanbot_script_failed'));
    document.head.appendChild(script);
  });
}

export async function getScanbotSdkV1075(options = {}) {
  if (!sdkPromiseV1075) {
    sdkPromiseV1075 = timeoutV1075((async () => {
      options.onStatus?.('Starting professional scanner…');
      const ScanbotSDK = await loadScriptV1075();
      const sdk = await ScanbotSDK.initialize({
        licenseKey:process.env.NEXT_PUBLIC_SCANBOT_LICENSE_KEY || '',
        enginePath:SCANBOT_ENGINE_V1075,
        requestSuffix:'?road-ready-v1075',
      });
      const license = await sdk.getLicenseInfo?.();
      if (license && typeof license.isValid === 'function' && !license.isValid()) throw new Error('scanbot_license_invalid');
      return { sdk, ScanbotSDK, license };
    })(), 18000, 'scanbot_initialize_timeout').catch(error => {
      sdkPromiseV1075 = null;
      throw error;
    });
  }
  return sdkPromiseV1075;
}

function normalizePointV1075(point) {
  if (!point) return null;
  const x = Number(point.x ?? point.X ?? point[0]);
  const y = Number(point.y ?? point.Y ?? point[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function normalizeQuadV1075(points) {
  const list = Array.isArray(points) ? points.map(normalizePointV1075).filter(Boolean) : [];
  if (list.length !== 4) return null;
  const bySum = [...list].sort((a, b) => a.x + a.y - b.x - b.y);
  const topLeft = bySum[0];
  const bottomRight = bySum[3];
  const middle = bySum.slice(1, 3);
  const topRight = middle[0].x > middle[1].x ? middle[0] : middle[1];
  const bottomLeft = middle[0].x > middle[1].x ? middle[1] : middle[0];
  return { topLeft, topRight, bottomRight, bottomLeft };
}

async function imageFromFileV1075(file, ScanbotSDK) {
  const bytes = await file.arrayBuffer();
  const ImageConfig = ScanbotSDK?.Config?.Image;
  if (!ImageConfig?.fromEncodedBinaryData) throw new Error('scanbot_image_api_missing');
  return ImageConfig.fromEncodedBinaryData(bytes);
}

function resultPointsV1075(result) {
  return result?.detectionResult?.pointsNormalized
    || result?.documentScanningResult?.pointsNormalized
    || result?.pointsNormalized
    || result?.detectionResult?.points
    || result?.points
    || null;
}

export async function detectDocumentCornersScanbotV1075(file, options = {}) {
  const { sdk, ScanbotSDK } = await getScanbotSdkV1075(options);
  const image = await imageFromFileV1075(file, ScanbotSDK);
  options.onStatus?.('Finding the full paper…');
  const response = await timeoutV1075(sdk.detectDocument(image, {
    parameters:{
      acceptedAngleScore:0.45,
      acceptedSizeScore:0.35,
      alreadyCroppedScoreThreshold:0.72,
    },
  }), 12000, 'scanbot_detection_timeout');
  const quad = normalizeQuadV1075(resultPointsV1075(response));
  if (!quad) throw new Error('scanbot_document_not_found');
  return quad;
}

function bytesFromEncodedV1075(encoded) {
  if (!encoded) return null;
  if (encoded instanceof Uint8Array) return encoded;
  if (encoded instanceof ArrayBuffer) return new Uint8Array(encoded);
  if (encoded.data instanceof Uint8Array) return encoded.data;
  if (encoded.data instanceof ArrayBuffer) return new Uint8Array(encoded.data);
  if (encoded.bytes instanceof Uint8Array) return encoded.bytes;
  return null;
}

export async function rectifyDocumentScanbotV1075(file, corners, options = {}) {
  const { sdk, ScanbotSDK } = await getScanbotSdkV1075(options);
  const image = await imageFromFileV1075(file, ScanbotSDK);
  const processor = await sdk.createImageProcessor();
  const polygon = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  options.onStatus?.('Straightening and flattening page…');
  let processed = await processor.crop(image, polygon);
  try {
    const enhancer = await sdk.createDocumentEnhancer?.();
    if (enhancer?.straighten) processed = await enhancer.straighten(processed, { straighteningMode:'STRAIGHTEN' });
  } catch {
    // Professional crop remains valid when the optional v9 dewarper is unavailable.
  }
  let encoded = null;
  if (typeof sdk.imageToJpeg === 'function') encoded = await sdk.imageToJpeg(processed, { quality:95 });
  else if (typeof processor.encode === 'function') encoded = await processor.encode(processed, { format:'JPEG', quality:95 });
  const bytes = bytesFromEncodedV1075(encoded);
  if (!bytes?.byteLength) throw new Error('scanbot_jpeg_encode_failed');
  return new File([bytes], options.name || 'road-ready-professional-scan.jpg', { type:'image/jpeg', lastModified:Date.now() });
}

export function scanbotProfessionalProfileV1075() {
  return Object.freeze({
    version:SCANBOT_VERSION_V1075,
    primary:true,
    processing:'on-device',
    automaticCrop:true,
    perspectiveCorrection:true,
    dewarping:true,
    fallback:'road-ready-webgl',
    licenseRequiredForProduction:true,
  });
}
`;
write('source/src/modules/scan/scanbotProfessionalAdapterV1075.js', adapter);

const enginePath = 'source/src/modules/scan/documentScannerEngine.js';
let engine = read(enginePath);
const importLine = "import { detectDocumentCornersScanbotV1075, rectifyDocumentScanbotV1075 } from './scanbotProfessionalAdapterV1075.js'; // scanbot-professional-v1075";
if (!engine.includes(importLine)) engine = `${importLine}\n${engine}`;

const detectStart = engine.indexOf('export async function detectDocumentCorners(source, options = {}) {');
const detectEnd = engine.indexOf('\nexport async function fileToImage', detectStart);
if (detectStart < 0 || detectEnd < 0) throw new Error('v107.5 detect function boundaries missing');
const detectFallback = engine.slice(detectStart, detectEnd).replace('export async function detectDocumentCorners', 'async function detectDocumentCornersRoadReadyFallbackV1075');
const detectReplacement = `${detectFallback}\nexport async function detectDocumentCorners(source, options = {}) {\n  try {\n    return await detectDocumentCornersScanbotV1075(source, options);\n  } catch (error) {\n    options.onStatus?.('Professional scanner unavailable — using Road Ready fallback');\n    return detectDocumentCornersRoadReadyFallbackV1075(source, options);\n  }\n}`;
engine = `${engine.slice(0, detectStart)}${detectReplacement}${engine.slice(detectEnd)}`;

const cropStart = engine.indexOf('export async function perspectiveCropFile(file, corners, options = {}) {');
const cropEnd = engine.indexOf('\nfunction rotateCanvas', cropStart);
if (cropStart < 0 || cropEnd < 0) throw new Error('v107.5 crop function boundaries missing');
const cropFallback = engine.slice(cropStart, cropEnd).replace('export async function perspectiveCropFile', 'async function perspectiveCropFileRoadReadyFallbackV1075');
const cropReplacement = `${cropFallback}\nexport async function perspectiveCropFile(file, corners, options = {}) {\n  try {\n    return await rectifyDocumentScanbotV1075(file, corners, options);\n  } catch (error) {\n    options.onStatus?.('Using local perspective fallback…');\n    return perspectiveCropFileRoadReadyFallbackV1075(file, corners, options);\n  }\n}`;
engine = `${engine.slice(0, cropStart)}${cropReplacement}${engine.slice(cropEnd)}`;

for (const marker of ['scanbot-professional-v1075','detectDocumentCornersScanbotV1075(source','rectifyDocumentScanbotV1075(file, corners']) {
  if (!engine.includes(marker)) throw new Error(`v107.5 integration missing ${marker}`);
}
write(enginePath, engine);
console.log('v107.5 Scanbot professional scanner adapter patched');
