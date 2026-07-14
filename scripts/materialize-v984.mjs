import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '98.4.0';
const RELEASED_AT = '2026-07-14T05:25:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, search, replacement, label) {
  if (content.includes(replacement)) return content;
  if (search instanceof RegExp) {
    if (!search.test(content)) throw new Error(`v98.4 missing ${label}`);
    return content.replace(search, replacement);
  }
  if (!content.includes(search)) throw new Error(`v98.4 missing ${label}`);
  return content.replace(search, replacement);
}

const turboPath = 'source/src/modules/scan/TurboDocumentScanner.jsx';
let turbo = read(turboPath);
turbo = replaceOnce(
  turbo,
  "  const lastCornersRef = useRef(null);\n  const stableFramesRef = useRef(0);",
  "  const lastCornersRef = useRef(null);\n  const stableFramesRef = useRef(0);\n  const suggestedCornersRef = useRef(null);",
  'scanner suggested-corner ref'
);
turbo = replaceOnce(
  turbo,
  "  const frameFound = autoFrame && frameDetected && documentPolygonArea(liveCorners) > .12;",
  "  const liveFill = frameDetected ? documentPolygonArea(liveCorners) : 0;\n  const frameFound = autoFrame && frameDetected && liveFill > .18;\n  const captureReady = !autoFrame || Boolean(quality.captureReady);",
  'scanner capture readiness'
);
turbo = replaceOnce(
  turbo,
  "    setFrameDetected(false);\n    stableFramesRef.current = 0;\n    lastCornersRef.current = null;",
  "    setFrameDetected(false);\n    stableFramesRef.current = 0;\n    suggestedCornersRef.current = null;\n    lastCornersRef.current = null;",
  'scanner readiness reset'
);
turbo = replaceOnce(
  turbo,
  "        video:{\n          facingMode:{ ideal:'environment' },\n          width:{ ideal:3024 },\n          height:{ ideal:4032 },\n        },",
  "        video:{\n          facingMode:{ ideal:'environment' },\n          width:{ ideal:3840 },\n          height:{ ideal:2160 },\n          frameRate:{ ideal:15, max:30 },\n          resizeMode:'none',\n        },",
  'high-resolution camera constraints'
);
turbo = replaceOnce(
  turbo,
  "        const advanced = [];\n        if (Array.isArray(capabilities?.focusMode) && capabilities.focusMode.includes('continuous')) advanced.push({ focusMode:'continuous' });\n        if (advanced.length) await track.applyConstraints({ advanced });",
  "        const advanced = [];\n        if (Array.isArray(capabilities?.focusMode) && capabilities.focusMode.includes('continuous')) advanced.push({ focusMode:'continuous' });\n        if (Array.isArray(capabilities?.exposureMode) && capabilities.exposureMode.includes('continuous')) advanced.push({ exposureMode:'continuous' });\n        if (Array.isArray(capabilities?.whiteBalanceMode) && capabilities.whiteBalanceMode.includes('continuous')) advanced.push({ whiteBalanceMode:'continuous' });\n        if (advanced.length) await track.applyConstraints({ advanced });",
  'continuous camera focus and exposure'
);
turbo = replaceOnce(
  turbo,
  "        const nextQuality = assessDocumentFrame(canvas);\n        if (mountedRef.current) setQuality(nextQuality);\n        const desiredTorch = flashMode === 'on' || (flashMode === 'auto' && nextQuality.brightness > 0 && nextQuality.brightness < 58);",
  "        const nextQuality = assessDocumentFrame(canvas);\n        if (!autoFrame && mountedRef.current) setQuality({ ...nextQuality, captureReady:nextQuality.good, fill:1 });\n        const desiredTorch = flashMode === 'on' || (flashMode === 'auto' && nextQuality.brightness > 0 && nextQuality.brightness < 58);",
  'scanner quality ownership'
);
turbo = replaceOnce(
  turbo,
  "        if (autoFrame) {\n          const detected = await detectDocumentCorners(canvas, { maxDimension:540 });\n          if (detected && mountedRef.current) {\n            const previous = lastCornersRef.current;\n            const stable = Boolean(previous) && cornerDelta(previous, detected) < .016 && nextQuality.good;\n            stableFramesRef.current = stable ? stableFramesRef.current + 1 : 0;\n            lastCornersRef.current = detected;\n            setLiveCorners(detected);\n            setFrameDetected(true);\n            if (stableFramesRef.current >= 4 && !capturing) {\n              stableFramesRef.current = 0;\n              void capturePage(detected);\n            }\n          } else if (mountedRef.current) {\n            stableFramesRef.current = 0;\n            setFrameDetected(false);\n          }\n        }",
  "        if (autoFrame) {\n          const detected = await detectDocumentCorners(canvas, { maxDimension:540 });\n          if (detected && mountedRef.current) {\n            const previous = lastCornersRef.current;\n            const fill = documentPolygonArea(detected);\n            let hint = nextQuality.hint;\n            let ready = nextQuality.good;\n            if (fill < .34) {\n              hint = 'Move closer — fill the page inside the frame';\n              ready = false;\n            } else if (fill > .93) {\n              hint = 'Move back slightly — keep all four corners visible';\n              ready = false;\n            } else if (!nextQuality.good) {\n              hint = nextQuality.hint;\n            } else {\n              hint = 'Hold steady — page is ready';\n            }\n            const stable = Boolean(previous) && cornerDelta(previous, detected) < .012 && ready;\n            stableFramesRef.current = stable ? stableFramesRef.current + 1 : 0;\n            lastCornersRef.current = detected;\n            setLiveCorners(detected);\n            setFrameDetected(true);\n            setQuality({ ...nextQuality, hint, good:ready, captureReady:ready, fill });\n            if (stableFramesRef.current >= 5 && !capturing) {\n              stableFramesRef.current = 0;\n              void capturePage(detected);\n            }\n          } else if (mountedRef.current) {\n            stableFramesRef.current = 0;\n            setFrameDetected(false);\n            setQuality({ ...nextQuality, good:false, captureReady:false, fill:0, hint:'Place all four paper corners inside the camera' });\n          }\n        }",
  'close-page capture gate'
);
turbo = replaceOnce(
  turbo,
  "  async function capturePage(cornersOverride = null) {\n    if (capturing || cameraState !== 'ready') return;\n    setCapturing(true);",
  "  async function capturePage(cornersOverride = null) {\n    if (capturing || cameraState !== 'ready') return;\n    if (autoFrame && !cornersOverride && !captureReady) {\n      setQuality(current => ({ ...current, good:false, captureReady:false, hint:liveFill < .34 ? 'Move closer — the document is too small to read' : 'Hold steady until the page turns ready' }));\n      return;\n    }\n    setCapturing(true);",
  'manual shutter quality gate'
);
turbo = replaceOnce(
  turbo,
  "      const suggestedCorners = cornersOverride?.topLeft ? cornersOverride : (frameFound ? liveCorners : null);\n      setCropCorners(suggestedCorners || defaultDocumentCorners());",
  "      const suggestedCorners = cornersOverride?.topLeft ? cornersOverride : (frameFound ? liveCorners : null);\n      suggestedCornersRef.current = suggestedCorners ? normalizeDocumentCorners(suggestedCorners) : null;\n      setCropCorners(suggestedCornersRef.current || defaultDocumentCorners());",
  'preserve live crop selection'
);
turbo = replaceOnce(
  turbo,
  "        const image = await fileToImage(currentFile);\n        const detected = await detectDocumentCorners(image, { maxDimension:1200, onStatus:setVisionStatus });\n        if (!cancelled) setCropCorners(detected || defaultDocumentCorners());\n      } catch {\n        if (!cancelled) setCropCorners(defaultDocumentCorners());",
  "        const image = await fileToImage(currentFile);\n        const detected = await detectDocumentCorners(image, { maxDimension:1400, onStatus:setVisionStatus });\n        if (!cancelled) {\n          const detectedArea = detected ? documentPolygonArea(detected) : 0;\n          const nextCorners = detectedArea >= .08 ? detected : (suggestedCornersRef.current || defaultDocumentCorners());\n          setCropCorners(nextCorners);\n        }\n      } catch {\n        if (!cancelled) setCropCorners(suggestedCornersRef.current || defaultDocumentCorners());",
  'high-resolution crop fallback'
);
turbo = replaceOnce(
  turbo,
  "    setCurrentUrl(URL.createObjectURL(file));\n    setCropCorners(defaultDocumentCorners());\n    setStage('crop');",
  "    setCurrentUrl(URL.createObjectURL(file));\n    suggestedCornersRef.current = null;\n    setCropCorners(defaultDocumentCorners());\n    setStage('crop');",
  'imported crop reset'
);
turbo = replaceOnce(
  turbo,
  "          <button type=\"button\" className=\"turbo-shutter\" disabled={cameraState !== 'ready' || capturing} onClick={capturePage}><span>{capturing ? '…' : ''}</span></button>",
  "          <button type=\"button\" className=\"turbo-shutter\" disabled={cameraState !== 'ready' || capturing || (autoFrame && !captureReady)} onClick={capturePage}><span>{capturing ? '…' : ''}</span></button>",
  'disable distant auto capture'
);
write(turboPath, turbo);

const enginePath = 'source/src/modules/scan/documentScannerEngine.js';
let engine = read(enginePath);
engine = replaceOnce(
  engine,
  "  const scale = Math.min(1, 2300 / Math.max(sw, sh));\n  const canvas = document.createElement('canvas');\n  canvas.width = Math.max(1, Math.round(sw * scale));\n  canvas.height = Math.max(1, Math.round(sh * scale));",
  "  const minScale = Math.max(1, 1600 / Math.min(sw, sh));\n  const maxScale = 3200 / Math.max(sw, sh);\n  const scale = Math.max(.25, Math.min(3, minScale, maxScale));\n  const canvas = document.createElement('canvas');\n  canvas.width = Math.max(1, Math.round(sw * scale));\n  canvas.height = Math.max(1, Math.round(sh * scale));",
  'high-resolution bounding crop'
);
engine = replaceOnce(
  engine,
  "    const scale = Math.min(1.35, 2300 / Math.max(rawWidth, rawHeight));\n    const outputWidth = Math.max(900, Math.round(rawWidth * scale));\n    const outputHeight = Math.max(1100, Math.round(rawHeight * scale));",
  "    const minScale = Math.max(1, 1600 / Math.min(rawWidth, rawHeight));\n    const maxScale = 3200 / Math.max(rawWidth, rawHeight);\n    const scale = Math.max(.25, Math.min(3, minScale, maxScale));\n    const outputWidth = Math.max(1, Math.round(rawWidth * scale));\n    const outputHeight = Math.max(1, Math.round(rawHeight * scale));",
  'high-resolution perspective crop'
);
engine = replaceOnce(
  engine,
  "      const imageCapture = new window.ImageCapture(track);\n      const blob = await imageCapture.takePhoto();\n      if (blob?.size) return new File([blob], name, { type:blob.type || 'image/jpeg', lastModified:Date.now() });",
  "      const imageCapture = new window.ImageCapture(track);\n      let photoSettings;\n      try {\n        const capabilities = await imageCapture.getPhotoCapabilities?.();\n        const imageWidth = Number(capabilities?.imageWidth?.max || 0);\n        const imageHeight = Number(capabilities?.imageHeight?.max || 0);\n        if (imageWidth > 0 && imageHeight > 0) photoSettings = { imageWidth, imageHeight };\n      } catch {}\n      const blob = await imageCapture.takePhoto(photoSettings);\n      if (blob?.size) return new File([blob], name, { type:blob.type || 'image/jpeg', lastModified:Date.now() });",
  'maximum-resolution photo capture'
);
write(enginePath, engine);

const proPath = 'source/src/modules/scan/smartScanPro.js';
let pro = read(proPath);
pro = replaceOnce(
  pro,
  "import { extractProDocumentFields } from './smartScanExtractionPro.js';",
  "import {\n  extractProDocumentFieldsV984 as extractProDocumentFields,\n  sanitizeExtractedFieldsV984,\n  scoreExtractedFieldsV984,\n} from './smartScanExtractionV984.js';\nimport { recognizeDocumentTextV984 } from './smartScanOcrV984.js';",
  'v98.4 OCR imports'
);
pro = replaceOnce(
  pro,
  "    webOcr = await runWebOcr(file, preferredType, onProgress);",
  "    webOcr = await recognizeDocumentTextV984(file, preferredType, onProgress);",
  'v98.4 multi-pass OCR call'
);
pro = replaceOnce(
  pro,
  "  const fields = mergeFields(base?.fields, standardFields, proFields);",
  "  const fields = sanitizeExtractedFieldsV984(mergeFields(base?.fields, standardFields, proFields), selected.type.id);",
  'v98.4 field sanitization'
);
pro = replaceOnce(
  pro,
  "  const method = base?.method === 'native'",
  "  const fieldStats = scoreExtractedFieldsV984(selected.type.id, fields);\n  const detailsConfidence = ['bol','pod'].includes(selected.type.id)\n    ? Math.min(confidence, .32 + (fieldStats.coverage * .68))\n    : confidence;\n  const method = base?.method === 'native'",
  'field coverage confidence'
);
pro = replaceOnce(
  pro,
  "    ocrConfidence:Number(webOcr?.confidence || 0),\n    alternatives,",
  "    ocrConfidence:Number(webOcr?.confidence || 0),\n    detailsConfidence,\n    fieldStats,\n    ocrPasses:webOcr?.passes || [],\n    alternatives,",
  'v98.4 analyzer metadata'
);
pro = replaceOnce(
  pro,
  "    needsReview:!text || confidence < 0.8 || selected.type?.id === 'other',",
  "    needsReview:!text || detailsConfidence < .82 || fieldStats.criticalMissing.length > 0 || selected.type?.id === 'other',",
  'detail-grounded review state'
);
write(proPath, pro);

const sheetPath = 'source/src/modules/scan/SmartScanSheet.jsx';
let sheet = read(sheetPath);
sheet = replaceOnce(
  sheet,
  "function confidenceLabel(value = 0) {\n  if (value >= 0.9) return 'High confidence';\n  if (value >= 0.72) return 'Good match';\n  return 'Review needed';\n}",
  "function confidenceLabel(value = 0, needsReview = false) {\n  if (needsReview) return 'Review details';\n  if (value >= 0.9) return 'Details captured';\n  if (value >= 0.72) return 'Good detail read';\n  return 'Review details';\n}",
  'honest confidence labels'
);
sheet = replaceOnce(
  sheet,
  "  if (method === 'web-ocr') return 'Enhanced document OCR';",
  "  if (method === 'web-ocr') return 'Enhanced document OCR';\n  if (method === 'web-ocr-pro') return 'Multi-pass document OCR';",
  'v98.4 OCR method label'
);
sheet = replaceOnce(
  sheet,
  "        date:dateInputValue(result.fields.date),",
  "        date:result.fields.date ? dateInputValue(result.fields.date) : '',",
  'do not invent document date'
);
sheet = replaceOnce(
  sheet,
  "      const meta = selectedMeta;\n      const store = readBusinessStore();",
  "      const meta = selectedMeta;\n      if (['bol','pod'].includes(meta.id) && !fields.date) {\n        setSaveError('Confirm the document date before saving.');\n        setStage('review');\n        return;\n      }\n      const store = readBusinessStore();",
  'document date confirmation'
);
sheet = replaceOnce(
  sheet,
  "  const confidence = Math.round((analysis?.confidence || 0) * 100);",
  "  const detailConfidence = Number(analysis?.detailsConfidence ?? analysis?.confidence ?? 0);\n  const confidence = Math.round(detailConfidence * 100);\n  const fieldSummary = analysis?.fieldStats\n    ? `${analysis.fieldStats.found} of ${analysis.fieldStats.total} details read`\n    : `${confidence}% detail read`;",
  'detail confidence summary'
);
sheet = replaceOnce(
  sheet,
  "{confidenceLabel(analysis.confidence)}",
  "{confidenceLabel(detailConfidence, analysis.needsReview)}",
  'detail confidence badge'
);
sheet = replaceOnce(
  sheet,
  "<em>{methodLabel(analysis.method)} · {confidence}% match</em>",
  "<em>{methodLabel(analysis.method)} · {fieldSummary}</em>",
  'remove inflated match percentage'
);
sheet = replaceOnce(
  sheet,
  "<Field label=\"Date\"><input type=\"date\" value={fields.date || localDateKey()} onChange={event => updateField('date', event.target.value)} /></Field>",
  "<Field label=\"Date\"><input type=\"date\" value={fields.date || ''} onChange={event => updateField('date', event.target.value)} /></Field>",
  'blank unread date'
);
sheet = replaceOnce(
  sheet,
  "<div className=\"smart-scan-saved-card\"><span>Classification</span><b>{savedResult.type.label}</b><em>{confidence}% confidence · driver confirmed</em></div>",
  "<div className=\"smart-scan-saved-card\"><span>Document details</span><b>{savedResult.type.label}</b><em>{confidence}% detail confidence · driver confirmed</em></div>",
  'saved detail confidence'
);
write(sheetPath, sheet);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v98.4-close-capture-multipass-ocr',
  releasedAt:RELEASED_AT,
  notes:[
    'Requires the paper to fill the camera before automatic capture, keeps all four corners visible, and blocks distant low-detail scans in Auto mode.',
    'Captures the highest photo resolution exposed by the phone, preserves the live paper selection, and upscales the corrected page for small printed text.',
    'Runs sharpened grayscale, adaptive black-and-white, BOL header, and signature-time OCR passes when fields are missing.',
    'Rejects OCR label fragments such as NUMBER, keeps an unread date blank, and scores confidence from extracted fields instead of document-type recognition alone.',
    'Preserves logbook, HOS, DOT, route, signature, wallet, load, and business data.'
  ],
  label:'v98.4 Strong Scan + Multi-pass OCR',
  updatedAt:RELEASED_AT
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyTurbo = read(turboPath);
const verifyEngine = read(enginePath);
const verifyPro = read(proPath);
const verifySheet = read(sheetPath);
if (!verifyTurbo.includes("liveFill >= .34") || !verifyTurbo.includes('suggestedCornersRef') || !verifyTurbo.includes('captureReady')) {
  throw new Error('v98.4 close-capture verification failed');
}
if (!verifyEngine.includes('1600 / Math.min(rawWidth, rawHeight)') || !verifyEngine.includes('getPhotoCapabilities')) {
  throw new Error('v98.4 high-resolution scanner verification failed');
}
if (!verifyPro.includes('recognizeDocumentTextV984') || !verifyPro.includes('detailsConfidence') || !verifyPro.includes('sanitizeExtractedFieldsV984')) {
  throw new Error('v98.4 multi-pass OCR integration verification failed');
}
if (!verifySheet.includes('details read') || !verifySheet.includes('Confirm the document date before saving.')) {
  throw new Error('v98.4 review honesty verification failed');
}

console.log('materialize-v984 complete');
