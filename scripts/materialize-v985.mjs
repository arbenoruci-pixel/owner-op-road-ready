import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '98.6.0';
const RELEASED_AT = '2026-07-14T14:20:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, search, replacement, label) {
  if (content.includes(replacement)) return content;
  if (!content.includes(search)) throw new Error(`v98.6 missing ${label}`);
  return content.replace(search, replacement);
}

const turboPath = 'source/src/modules/scan/TurboDocumentScanner.jsx';
let turbo = read(turboPath);
turbo = replaceOnce(
  turbo,
  "} from './documentScannerEngine.js';",
  "} from './documentScannerEngine.js';\nimport {\n  analyzeDocumentFrameV985,\n  detectDocumentV985,\n  filterDisplayNameV985,\n  perspectiveCropFileV985,\n  renderDocumentFileV985,\n  smoothDocumentCornersV985,\n} from './documentQualityV985.js';",
  'quality engine import'
);
turbo = replaceOnce(
  turbo,
  "  { id:'auto', label:'Auto' },",
  "  { id:'auto', label:'Smart Clean' },",
  'Smart Clean filter label'
);
turbo = replaceOnce(
  turbo,
  '  const stableFramesRef = useRef(0);',
  '  const stableFramesRef = useRef(0);\n  const darkFramesRef = useRef(0);',
  'dark frame hysteresis ref'
);
turbo = replaceOnce(
  turbo,
  '    stableFramesRef.current = 0;\n    lastCornersRef.current = null;',
  '    stableFramesRef.current = 0;\n    darkFramesRef.current = 0;\n    lastCornersRef.current = null;',
  'camera quality reset'
);
turbo = replaceOnce(
  turbo,
  "        const canvas = drawVideoSample(videoRef.current, 540);\n        if (!canvas) return;\n        const nextQuality = assessDocumentFrame(canvas);\n        if (mountedRef.current) setQuality(nextQuality);\n        const desiredTorch = flashMode === 'on' || (flashMode === 'auto' && nextQuality.brightness > 0 && nextQuality.brightness < 82);\n        if (torchSupported && desiredTorch !== torchRef.current) {\n          const changed = await setTrackTorch(trackRef.current, desiredTorch);\n          if (changed) torchRef.current = desiredTorch;\n        }\n        if (autoFrame) {\n          const detected = await detectDocumentCorners(canvas, { maxDimension:540 });\n          if (detected && mountedRef.current) {\n            const previous = lastCornersRef.current;\n            const stable = Boolean(previous) && cornerDelta(previous, detected) < .016 && nextQuality.good;\n            stableFramesRef.current = stable ? stableFramesRef.current + 1 : 0;\n            lastCornersRef.current = detected;\n            setLiveCorners(detected);\n            setFrameDetected(true);\n            if (stableFramesRef.current >= 4 && !capturing) {\n              stableFramesRef.current = 0;\n              void capturePage(detected);\n            }\n          } else if (mountedRef.current) {\n            stableFramesRef.current = 0;\n            setFrameDetected(false);\n          }\n        }",
  "        const canvas = drawVideoSample(videoRef.current, 540);\n        if (!canvas) return;\n        const nextQuality = await analyzeDocumentFrameV985(canvas, { maxDimension:520 });\n        if (mountedRef.current) setQuality(nextQuality);\n        darkFramesRef.current = nextQuality.autoFlashNeeded\n          ? Math.min(8, darkFramesRef.current + 1)\n          : Math.max(0, darkFramesRef.current - 2);\n        const desiredTorch = flashMode === 'on'\n          || (flashMode === 'auto' && darkFramesRef.current >= 4);\n        if (torchSupported && desiredTorch !== torchRef.current) {\n          const changed = await setTrackTorch(trackRef.current, desiredTorch);\n          if (changed) torchRef.current = desiredTorch;\n        }\n        if (autoFrame) {\n          const detected = nextQuality.paperDetected\n            ? { corners:nextQuality.corners, confidence:nextQuality.confidence, coverage:nextQuality.coverage }\n            : null;\n          if (detected?.corners && detected.confidence >= .5 && mountedRef.current) {\n            const previous = lastCornersRef.current;\n            const smoothed = smoothDocumentCornersV985(previous, detected.corners, previous ? .34 : 1);\n            const stable = Boolean(previous)\n              && cornerDelta(previous, detected.corners) < .012\n              && nextQuality.good\n              && detected.confidence >= .62;\n            stableFramesRef.current = stable ? stableFramesRef.current + 1 : 0;\n            lastCornersRef.current = smoothed;\n            setLiveCorners(smoothed);\n            setFrameDetected(true);\n            if (stableFramesRef.current >= 6 && !capturing) {\n              stableFramesRef.current = 0;\n              void capturePage(smoothed);\n            }\n          } else if (mountedRef.current) {\n            stableFramesRef.current = 0;\n            lastCornersRef.current = null;\n            setFrameDetected(false);\n          }\n        }",
  'paper-aware quality, flash, and live framing loop'
);
turbo = replaceOnce(
  turbo,
  "      const needsFlash = flashMode === 'on' || (flashMode === 'auto' && quality.brightness > 0 && quality.brightness < 82);",
  "      const needsFlash = flashMode === 'on' || (flashMode === 'auto' && Boolean(quality.autoFlashNeeded));",
  'capture flash decision'
);
turbo = replaceOnce(
  turbo,
  "        const detected = await detectDocumentCorners(image, { maxDimension:1200, onStatus:setVisionStatus });\n        if (!cancelled) setCropCorners(detected || defaultDocumentCorners());",
  "        const detected = await detectDocumentV985(image, { maxDimension:1500, onStatus:setVisionStatus });\n        if (!cancelled) setCropCorners(detected?.confidence >= .32 ? detected.corners : defaultDocumentCorners());",
  'still-image auto frame'
);
turbo = replaceOnce(
  turbo,
  '        const next = await renderDocumentFile(baseFile, {',
  '        const next = await renderDocumentFileV985(baseFile, {',
  'high-quality preview rendering'
);
turbo = replaceOnce(
  turbo,
  '      const cropped = await perspectiveCropFile(currentFile, cropCorners, {',
  '      const cropped = await perspectiveCropFileV985(currentFile, cropCorners, {',
  'high-quality perspective crop'
);
turbo = replaceOnce(
  turbo,
  "                const detected = await detectDocumentCorners(image, { onStatus:setVisionStatus });\n                setCropCorners(detected || defaultDocumentCorners());",
  "                const detected = await detectDocumentV985(image, { maxDimension:1600, onStatus:setVisionStatus });\n                setCropCorners(detected?.confidence >= .3 ? detected.corners : defaultDocumentCorners());",
  'manual Auto Frame action'
);
turbo = replaceOnce(
  turbo,
  "<button type=\"button\" className=\"filter-label\" onClick={() => setFilter(current => current === 'bw' ? 'auto' : 'bw')}>{FILTERS.find(item => item.id === filter)?.label || 'Auto'}</button>",
  "<button type=\"button\" className=\"filter-label\" onClick={() => setFilter(current => current === 'bw' ? 'auto' : 'bw')}>{filterDisplayNameV985(filter)}</button>",
  'filter display name'
);
write(turboPath, turbo);

const capturePath = 'source/src/modules/scan/SmartDocumentCapture.jsx';
let capture = read(capturePath);
capture = replaceOnce(
  capture,
  "export default function SmartDocumentCapture({ onReady, onClose }) {\n  const nativeCameraRef = useRef(null);",
  "export default function SmartDocumentCapture({ onReady, onClose }) {\n  const nativeCameraRef = useRef(null);\n  const isAppleMobile = useMemo(() => {\n    if (typeof navigator === 'undefined') return false;\n    return /iPhone|iPad|iPod/i.test(navigator.userAgent || '')\n      || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);\n  }, []);",
  'Apple best-quality detection'
);
capture = replaceOnce(
  capture,
  "      <footer className=\"scan-preflight-actions two\">\n        <button type=\"button\" className=\"primary\" onClick={openLiveScanner}><Icon name=\"camera\" /> Document camera <Icon name=\"chevron\" size={18} /></button>\n        <button type=\"button\" className=\"native\" onClick={() => nativeCameraRef.current?.click()}><Icon name=\"flash\" /> Phone camera + flash</button>",
  "      <footer className=\"scan-preflight-actions two\">\n        <button\n          type=\"button\"\n          className=\"primary\"\n          onClick={() => isAppleMobile ? nativeCameraRef.current?.click() : openLiveScanner()}\n        ><Icon name=\"camera\" /> {isAppleMobile ? 'Best quality scan' : 'Live auto frame'} <Icon name=\"chevron\" size={18} /></button>\n        <button\n          type=\"button\"\n          className=\"native\"\n          onClick={() => isAppleMobile ? openLiveScanner() : nativeCameraRef.current?.click()}\n        ><Icon name=\"flash\" /> {isAppleMobile ? 'Live auto frame' : 'Phone camera + flash'}</button>",
  'best-quality iPhone entry point'
);
write(capturePath, capture);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v98.6-professional-text-detection',
  releasedAt:RELEASED_AT,
  notes:[
    'Adds multi-pass high-resolution OCR for trucking documents with full-page, table-layout, header, route, totals, and footer recognition passes.',
    'Reads BOL number, customer PO, ship-from, ship-to, seal, trailer, total pieces, total weight, and handwritten timing areas from dedicated document regions.',
    'Rejects OCR label fragments such as ACCOUNT, NUMBER, LOADES, and two-letter noise instead of inserting them as field values.',
    'Separates freight weight from money so BOL line-item weights no longer populate the Amount field.',
    'Ties the displayed confidence to extracted-field coverage while preserving scanner quality, logbook, HOS, DOT, wallet, route, load, and business data.'
  ],
  label:'v98.6 Professional Text Detection',
  updatedAt:RELEASED_AT
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyTurbo = read(turboPath);
const verifyQuality = read('source/src/modules/scan/documentQualityV985.js');
const verifyCapture = read(capturePath);
const verifyOcr = read('source/src/modules/scan/smartScanPro.js');
const verifyExtraction = read('source/src/modules/scan/smartScanExtractionPro.js');
if (!verifyTurbo.includes('analyzeDocumentFrameV985') || !verifyTurbo.includes('perspectiveCropFileV985') || !verifyTurbo.includes('darkFramesRef.current >= 4')) {
  throw new Error('v98.6 Turbo quality integration verification failed');
}
if (!verifyQuality.includes('collectContourCandidates') || !verifyQuality.includes('adaptiveThreshold') || !verifyQuality.includes('boxBlur') || !verifyQuality.includes('autoFlashNeeded')) {
  throw new Error('v98.6 quality engine verification failed');
}
if (!verifyCapture.includes('Best quality scan') || !verifyCapture.includes('isAppleMobile')) {
  throw new Error('v98.6 iPhone capture verification failed');
}
if (!verifyOcr.includes('runBolRegionOcr') || !verifyOcr.includes('fieldCoverage') || !verifyOcr.includes("next.total = ''")) {
  throw new Error('v98.6 professional OCR verification failed');
}
if (!verifyExtraction.includes('extractBolNumber') || !verifyExtraction.includes('validIdentifier') || !verifyExtraction.includes("regionText(raw, 'TOTALS')")) {
  throw new Error('v98.6 BOL extraction verification failed');
}
console.log('v98.6 professional text detection materialized');
