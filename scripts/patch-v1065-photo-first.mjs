import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'source/src/modules/scan/SmartDocumentCaptureV106.jsx');
let source = fs.readFileSync(target, 'utf8');

function replaceOnce(pattern, replacement, label) {
  if (typeof pattern === 'string') {
    if (source.includes(replacement)) return;
    if (!source.includes(pattern)) throw new Error(`v106.5 missing ${label}`);
    source = source.replace(pattern, replacement);
    return;
  }
  if (pattern.test(source)) {
    source = source.replace(pattern, replacement);
    return;
  }
  if (!source.includes(replacement)) throw new Error(`v106.5 missing ${label}`);
}

const importLine = "import { selectPhotoFirstCandidateV1065 } from './photoFirstCandidateV1065.js'; // photo-first-v1065";
if (!source.includes(importLine)) {
  const correctionImport = /import \{ correctionContourV1064 \} from '\.\/correctionContourV1064\.js';[^\n]*\n/;
  if (correctionImport.test(source)) {
    source = source.replace(correctionImport, match => `${match}${importLine}\n`);
  } else if (/^['\"]use client['\"];?\n/.test(source)) {
    source = source.replace(/^(['\"]use client['\"];?\n)/, `$1${importLine}\n`);
  } else {
    source = `${importLine}\n${source}`;
  }
}

if (!source.includes('const PHOTO_FIRST_CAPTURE_V1065 = true;')) {
  const marker = 'function exactCameraHint(frame = {}, found = false, stableFrames = 0) {';
  const helpers = `const PHOTO_FIRST_CAPTURE_V1065 = true; // photo-first-v1065\nfunction photoFirstCameraHintV1065(frame = {}) {\n  if (Number(frame.brightness || 0) < 55) return 'Move to better light';\n  if (Number(frame.glare || 0) > .11) return 'Tilt the phone — glare detected';\n  if (Number(frame.sharpness || 0) < 10) return 'Hold still';\n  return 'Take one clear photo';\n}\n\n`;
  replaceOnce(marker, `${helpers}${marker}`, 'photo-first camera helpers');
}

source = source.replace(
  'const [autoCapture, setAutoCapture] = useState(true);',
  'const [autoCapture, setAutoCapture] = useState(false);',
);
source = source.replaceAll("setStatus('Hold over document');", "setStatus('Take one clear photo');");
source = source.replaceAll("setStatus('Capturing…');", "setStatus('Taking one photo…');");
source = source.replaceAll("setStatus('Finding the actual paper…');", "setStatus('Reading the page and finding the paper…');");

if (!source.includes('PHOTO_FIRST_CAPTURE_V1065) {\n            if (!mountedRef.current) return;')) {
  const livePattern = /(\s*)const found = await adapter\(\)\.detectDocumentRegions\(canvas,\s*\{[\s\S]*?\}\);/;
  if (!livePattern.test(source)) throw new Error('v106.5 missing photo-first live detector bypass');
  source = source.replace(livePattern, (match, indent) => `${indent}if (PHOTO_FIRST_CAPTURE_V1065) {\n${indent}  if (!mountedRef.current) return;\n${indent}  setLiveCandidate(null);\n${indent}  setStableFrames(0);\n${indent}  stableRef.current = { contour:null, count:0 };\n${indent}  setStatus(photoFirstCameraHintV1065(nextQuality));\n${indent}  return;\n${indent}}\n${match}`);
}

source = source.replace(
  /maxDimension:1400,\s*\n\s*gridMax:104,/,
  'maxDimension:2200,\n          gridMax:160,\n          photoFirst:true,',
);

if (!source.includes('const first = selectPhotoFirstCandidateV1065(found) || found[0] || null;')) {
  const openSourcePattern = /(const found = await adapter\(\)\.detectDocumentRegions\(image, \{[\s\S]*?onStatus:setStatus,[\s\S]*?\}\);\s*\n\s*if \(!mountedRef\.current\) return;\s*\n\s*)const first = [^\n;]+;/;
  if (!openSourcePattern.test(source)) throw new Error('v106.5 missing full-resolution candidate selection');
  source = source.replace(openSourcePattern, '$1const first = selectPhotoFirstCandidateV1065(found) || found[0] || null;');
}

source = source.replace(
  "setStatus(found.length > 1 ? 'Check the highlighted paper' : 'Paper found');",
  "setStatus(first ? 'Paper selected from one photo' : 'Check the photo');",
);

source = source.replace(
  'const cameraHint = exactCameraHint(frameQuality, frameFound, stableFrames);',
  'const cameraHint = PHOTO_FIRST_CAPTURE_V1065 ? photoFirstCameraHintV1065(frameQuality) : exactCameraHint(frameQuality, frameFound, stableFrames);',
);

if (!source.includes('photo-first-guide-v1065')) {
  const overlayMarker = "              {cameraState === 'ready' && liveCandidate ? (";
  const guide = `              {cameraState === 'ready' && PHOTO_FIRST_CAPTURE_V1065 ? (\n                <div className=\"photo-first-guide-v1065\" aria-hidden=\"true\" style={{ position:'absolute', left:'7%', top:'6%', width:'86%', height:'88%', border:'2px dashed rgba(255,255,255,.82)', borderRadius:12, boxShadow:'0 0 0 999px rgba(0,0,0,.08) inset', pointerEvents:'none' }}>\n                  <span style={{ position:'absolute', left:12, bottom:10, padding:'5px 8px', borderRadius:8, background:'rgba(0,0,0,.58)', color:'#fff', fontSize:12, fontWeight:800 }}>One photo — paper is found after capture</span>\n                </div>\n              ) : null}\n              {cameraState === 'ready' && !PHOTO_FIRST_CAPTURE_V1065 && liveCandidate ? (`;
  replaceOnce(overlayMarker, guide, 'photo-first camera guide');
}

source = source.replace(
  /<button type="button" className=\{autoCapture \? 'mode active' : 'mode'\} onClick=\{\(\) => setAutoCapture\(value => !value\)\}>\{autoCapture \? 'Auto' : 'Manual'\}<\/button>/,
  '<button type="button" className="mode active" disabled>Photo first</button>',
);

for (const marker of [
  'photo-first-v1065',
  'selectPhotoFirstCandidateV1065(found)',
  'maxDimension:2200',
  'photoFirst:true',
  'photo-first-guide-v1065',
  'Photo first</button>',
]) {
  if (!source.includes(marker)) throw new Error(`v106.5 verification missing ${marker}`);
}

fs.writeFileSync(target, source);
console.log('v106.5 Photo First capture flow patched');
