import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '98.3.2';
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
  if (!content.includes(search)) throw new Error(`v98.3.2 missing ${label}`);
  return content.replace(search, replacement);
}

const enginePath = 'source/src/modules/scan/documentScannerEngine.js';
let engine = read(enginePath);
engine = replaceOnce(
  engine,
  "export async function captureVideoFile(video, track, name = `road-ready-page-${Date.now()}.jpg`) {\n  if (typeof window !== 'undefined' && typeof window.ImageCapture === 'function' && track) {\n    try {\n      const imageCapture = new window.ImageCapture(track);\n      const blob = await imageCapture.takePhoto();\n      if (blob?.size) return new File([blob], name, { type:blob.type || 'image/jpeg', lastModified:Date.now() });\n    } catch {}\n  }\n  const { width, height } = sourceSize(video);\n  if (!width || !height) throw new Error('camera_not_ready');\n  const canvas = document.createElement('canvas');\n  canvas.width = width;\n  canvas.height = height;\n  canvas.getContext('2d').drawImage(video, 0, 0, width, height);\n  return canvasToFile(canvas, name);\n}",
  "export async function getCameraFlashSupport(track) {\n  const support = { torch:false, photo:false, modes:[] };\n  if (!track) return support;\n  try {\n    const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};\n    support.torch = capabilities?.torch === true || (Array.isArray(capabilities?.torch) && capabilities.torch.includes(true));\n  } catch {}\n  if (typeof window !== 'undefined' && typeof window.ImageCapture === 'function') {\n    try {\n      const imageCapture = new window.ImageCapture(track);\n      const capabilities = await imageCapture.getPhotoCapabilities?.();\n      support.modes = Array.isArray(capabilities?.fillLightMode) ? capabilities.fillLightMode.map(String) : [];\n      support.photo = support.modes.includes('flash') || support.modes.includes('auto') || !support.modes.length;\n    } catch {\n      support.photo = true;\n    }\n  }\n  return support;\n}\n\nexport async function captureVideoFile(video, track, name = `road-ready-page-${Date.now()}.jpg`, options = {}) {\n  if (typeof window !== 'undefined' && typeof window.ImageCapture === 'function' && track) {\n    try {\n      const imageCapture = new window.ImageCapture(track);\n      const support = await getCameraFlashSupport(track);\n      const lowLight = Boolean(options.lowLight);\n      const requested = options.flashMode === 'on' || (options.flashMode === 'auto' && lowLight)\n        ? 'flash'\n        : options.flashMode === 'off' || options.flashMode === 'auto'\n          ? 'off'\n          : 'auto';\n      let fillLightMode = requested;\n      if (support.modes.length && !support.modes.includes(fillLightMode)) {\n        if (fillLightMode === 'flash' && support.modes.includes('auto')) fillLightMode = 'auto';\n        else if (support.modes.includes('off')) fillLightMode = 'off';\n        else fillLightMode = support.modes[0] || '';\n      }\n      let blob;\n      try {\n        blob = fillLightMode ? await imageCapture.takePhoto({ fillLightMode }) : await imageCapture.takePhoto();\n      } catch {\n        blob = await imageCapture.takePhoto();\n      }\n      if (blob?.size) return new File([blob], name, { type:blob.type || 'image/jpeg', lastModified:Date.now() });\n    } catch {}\n  }\n  const { width, height } = sourceSize(video);\n  if (!width || !height) throw new Error('camera_not_ready');\n  const canvas = document.createElement('canvas');\n  canvas.width = width;\n  canvas.height = height;\n  canvas.getContext('2d').drawImage(video, 0, 0, width, height);\n  return canvasToFile(canvas, name);\n}",
  'still-photo flash capture'
);
engine = replaceOnce(
  engine,
  "export async function setTrackTorch(track, enabled) {\n  if (!track?.applyConstraints) return false;\n  try {\n    await track.applyConstraints({ advanced:[{ torch:Boolean(enabled) }] });\n    return true;\n  } catch {\n    return false;\n  }\n}",
  "export async function setTrackTorch(track, enabled) {\n  if (!track?.applyConstraints) return false;\n  const value = Boolean(enabled);\n  try {\n    await track.applyConstraints({ advanced:[{ torch:value }] });\n    return true;\n  } catch {}\n  try {\n    await track.applyConstraints({ torch:value });\n    return true;\n  } catch {\n    return false;\n  }\n}",
  'torch constraint fallback'
);
write(enginePath, engine);

const turboPath = 'source/src/modules/scan/TurboDocumentScanner.jsx';
let turbo = read(turboPath);
turbo = replaceOnce(turbo, '  filesFromNativeScan,\n  loadDocumentVision,', '  filesFromNativeScan,\n  getCameraFlashSupport,\n  loadDocumentVision,', 'flash support import');
turbo = replaceOnce(turbo, '  const galleryRef = useRef(null);', '  const galleryRef = useRef(null);\n  const phoneCameraRef = useRef(null);', 'phone camera ref');
turbo = replaceOnce(turbo, '  const [torchSupported, setTorchSupported] = useState(false);', '  const [torchSupported, setTorchSupported] = useState(false);\n  const [photoFlashSupported, setPhotoFlashSupported] = useState(false);', 'photo flash state');
turbo = replaceOnce(turbo, '  const frameFound = autoFrame && frameDetected && documentPolygonArea(liveCorners) > .12;', '  const frameFound = autoFrame && frameDetected && documentPolygonArea(liveCorners) > .12;\n  const flashSupported = torchSupported || photoFlashSupported;', 'flash support flag');
turbo = replaceOnce(turbo, "    setCameraError('');\n    setQuality({ hint:'Starting camera…', good:false, brightness:0, glare:0 });", "    setCameraError('');\n    setTorchSupported(false);\n    setPhotoFlashSupported(false);\n    setQuality({ hint:'Starting camera…', good:false, brightness:0, glare:0 });", 'flash state reset');
turbo = replaceOnce(turbo, "      const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};\n      setTorchSupported(Boolean(capabilities?.torch));", "      const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};\n      const flashSupport = await getCameraFlashSupport(track);\n      setTorchSupported(Boolean(flashSupport.torch || capabilities?.torch));\n      setPhotoFlashSupported(Boolean(flashSupport.photo));", 'flash capability detection');
turbo = replaceOnce(turbo, "        const desiredTorch = flashMode === 'on' || (flashMode === 'auto' && nextQuality.brightness > 0 && nextQuality.brightness < 58);", "        const desiredTorch = flashMode === 'on' || (flashMode === 'auto' && nextQuality.brightness > 0 && nextQuality.brightness < 82);", 'auto flash sensitivity');
turbo = replaceOnce(turbo, "      const file = await captureVideoFile(videoRef.current, trackRef.current, `road-ready-capture-${Date.now()}.jpg`);", "      const needsFlash = flashMode === 'on' || (flashMode === 'auto' && quality.brightness > 0 && quality.brightness < 82);\n      if (needsFlash && torchSupported && trackRef.current && !torchRef.current) {\n        const changed = await setTrackTorch(trackRef.current, true);\n        if (changed) {\n          torchRef.current = true;\n          await new Promise(resolve => setTimeout(resolve, 220));\n        }\n      }\n      const file = await captureVideoFile(\n        videoRef.current,\n        trackRef.current,\n        `road-ready-capture-${Date.now()}.jpg`,\n        { flashMode, lowLight:needsFlash }\n      );", 'flash-aware capture');
turbo = replaceOnce(turbo, "  function cycleFlash() {\n    if (!torchSupported) return;\n    setFlashMode(current => current === 'auto' ? 'on' : current === 'on' ? 'off' : 'auto');\n  }", "  function cycleFlash() {\n    if (!flashSupported) {\n      phoneCameraRef.current?.click();\n      return;\n    }\n    setFlashMode(current => current === 'auto' ? 'on' : current === 'on' ? 'off' : 'auto');\n  }", 'phone flash fallback');
turbo = replaceOnce(turbo, "  const flashLabel = torchSupported ? (flashMode === 'auto' ? 'Auto flash' : flashMode === 'on' ? 'Flash on' : 'Flash off') : 'Flash unavailable';", "  const flashLabel = flashSupported ? (flashMode === 'auto' ? 'Auto flash' : flashMode === 'on' ? 'Flash on' : 'Flash off') : 'Open phone camera with flash';", 'flash label');
turbo = replaceOnce(turbo, "          <button type=\"button\" className={!torchSupported ? 'disabled' : flashMode} onClick={cycleFlash} aria-label={flashLabel}><Icon name=\"flash\" /></button>", "          <button type=\"button\" className={!flashSupported ? 'fallback' : flashMode} onClick={cycleFlash} aria-label={flashLabel}><Icon name=\"flash\" /></button>", 'flash button');
turbo = replaceOnce(turbo, "          <input ref={galleryRef} className=\"smart-scan-file-input\" type=\"file\" accept=\"image/*,application/pdf,text/plain\" onChange={event => chooseImportedFile(event.target.files?.[0] || null)} />", "          <input ref={galleryRef} className=\"smart-scan-file-input\" type=\"file\" accept=\"image/*,application/pdf,text/plain\" onChange={event => chooseImportedFile(event.target.files?.[0] || null)} />\n          <input ref={phoneCameraRef} className=\"smart-scan-file-input\" type=\"file\" accept=\"image/*\" capture=\"environment\" onChange={event => { const nextFile = event.target.files?.[0] || null; event.target.value = ''; if (nextFile) void chooseImportedFile(nextFile); }} />", 'phone camera input');
write(turboPath, turbo);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({ version:VERSION, build:'v98.3.2-turbo-flash-fix', releasedAt:RELEASED_AT, notes:['Fixes Auto Flash by checking live torch and still-photo flash support, forcing flash in low light, and waiting for the light before capture.','Adds a direct torch-constraint fallback for browsers that reject advanced constraints.','When live flash is blocked, tapping the flash icon opens the phone camera so the driver can use device flash and return to the same crop, filter, OCR, and review flow.','Preserves Smart Scan, BOL extraction, logbook, HOS, DOT, route, wallet, load, and business data.'], label:'v98.3.2 Auto Flash Fix', updatedAt:RELEASED_AT }, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyEngine = read(enginePath);
const verifyTurbo = read(turboPath);
if (!verifyEngine.includes('getCameraFlashSupport') || !verifyEngine.includes('fillLightMode') || !verifyEngine.includes('track.applyConstraints({ torch:value })')) throw new Error('v98.3.2 flash engine verification failed');
if (!verifyTurbo.includes('photoFlashSupported') || !verifyTurbo.includes('phoneCameraRef') || !verifyTurbo.includes('lowLight:needsFlash') || !verifyTurbo.includes('Open phone camera with flash')) throw new Error('v98.3.2 scanner flash verification failed');
console.log('v98.3.2 Auto Flash fix materialized');
