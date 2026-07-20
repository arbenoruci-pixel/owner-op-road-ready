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

function replaceFunction(source, startNeedle, endNeedle, replacement, label) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`v107.2 missing ${label} boundaries start=${start} end=${end}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

// 1. Remove the remaining OpenCV waits from quality detection and legacy crop paths.
const qualityPath = 'source/src/modules/scan/documentQualityV985.js';
let quality = read(qualityPath);
const lightweightImport = "import { detectPageCornersLightweightV1071, warpPerspectiveWebGLV1071 } from './lightweightDocumentEngineV1071.js'; // reader-webgl-v1072";
if (!quality.includes(lightweightImport)) quality = `${lightweightImport}\n${quality}`;
quality = quality.replace(/\n\s*loadDocumentVision,/, '');

const detectReplacement = `export async function detectDocumentV985(source, options = {}) {
  try {
    const corners = await detectPageCornersLightweightV1071(source, {
      maxDimension:options.maxDimension || 1100,
      gridMax:options.gridMax || 112,
      onStatus:options.onStatus,
    });
    if (corners) {
      const normalized = normalizeDocumentCorners(corners);
      const coverage = documentPolygonArea(normalized);
      if (coverage >= .075) {
        return {
          corners:normalized,
          confidence:Math.min(.92, .68 + coverage * .32),
          coverage,
          score:.78 + coverage * .2,
          lightweight:true,
        };
      }
    }
  } catch {}

  try {
    const canvas = sourceToCanvas(source, options.maxDimension || 900);
    const fallback = detectDocumentCornersFallback(canvas);
    const corners = objectFromArray(fallback.corners || []);
    return {
      corners,
      confidence:Number(fallback.confidence || 0),
      coverage:Number(fallback.coverage || documentPolygonArea(corners)),
      score:0,
      fallback:true,
    };
  } catch {
    const corners = defaultDocumentCorners();
    return { corners, confidence:0, coverage:documentPolygonArea(corners), score:0, fallback:true };
  }
}`;
quality = replaceFunction(
  quality,
  'export async function detectDocumentV985(source, options = {}) {',
  '\nexport function smoothDocumentCornersV985',
  detectReplacement,
  'lightweight quality detector',
);

const cropReplacement = `export async function perspectiveCropFileV985(file, corners, options = {}) {
  const image = await fileToImage(file);
  const normalized = normalizeDocumentCorners(corners);
  options.onStatus?.('Straightening page…');
  try {
    const output = await warpPerspectiveWebGLV1071(image, normalized);
    const trimmed = trimCanvas(output, .0045);
    return canvasToFile(trimmed, options.name || \`road-ready-cropped-\${Date.now()}.jpg\`, 'image/jpeg', .97);
  } catch {
    return processDocumentImageFallback(file, {
      corners:arrayFromObject(normalized),
      filter:'original',
      maxEdge:Math.max(1200, Number(options.maxEdge || 3000)),
      fileName:options.name || file?.name || 'road-ready-cropped',
    });
  }
}`;
quality = replaceFunction(
  quality,
  'export async function perspectiveCropFileV985(file, corners, options = {}) {',
  '\nfunction boxBlur',
  cropReplacement,
  'WebGL legacy crop',
);
if (quality.includes('loadDocumentVision')) throw new Error('v107.2 documentQuality still initializes OpenCV');
write(qualityPath, quality);

// 2. Make OCR variant generation use the local Canvas variants immediately.
const intelligencePath = 'source/src/modules/scan/scannerIntelligenceV1030.js';
let intelligence = read(intelligencePath);
intelligence = intelligence.replace(/\n\s*loadDocumentVision,/, '');
intelligence = intelligence.replace("{ id:'normalized', filter:'ocr', label:'Shadow-normalized text', quality:.985 },", "{ id:'normalized', filter:'gray', label:'Shadow-normalized text', quality:.985 },");
const buildStart = intelligence.indexOf('export async function buildOcrVariantsV1030(file, options = {}) {');
if (buildStart < 0) throw new Error('v107.2 OCR variant function missing');
let buildEnd = intelligence.indexOf('\nexport ', buildStart + 20);
if (buildEnd < 0) buildEnd = intelligence.length;
const buildReplacement = `export async function buildOcrVariantsV1030(file, options = {}) {
  if (!String(file?.type || '').startsWith('image/')) return [];
  const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
  onStatus('Building local text variants…');
  return fallbackVariants(file, onStatus);
}`;
intelligence = `${intelligence.slice(0, buildStart)}${buildReplacement}${intelligence.slice(buildEnd)}`;
if (intelligence.includes('loadDocumentVision')) throw new Error('v107.2 scannerIntelligence still initializes OpenCV');
write(intelligencePath, intelligence);

// 3. Candidate alternatives that overlap the same sheet are not separate documents.
const adapterPath = 'source/src/modules/scan/webScannerAdapterV106.js';
let adapter = read(adapterPath);
const adapterHelper = `
function physicalCandidateBoundsV1072(candidate = {}) {
  const direct = candidate.bounds || {};
  if ([direct.left, direct.top, direct.right, direct.bottom].every(Number.isFinite)) return direct;
  const points = Array.isArray(candidate.contour) && candidate.contour.length
    ? candidate.contour
    : [candidate.corners?.topLeft, candidate.corners?.topRight, candidate.corners?.bottomRight, candidate.corners?.bottomLeft].filter(Boolean);
  if (!points.length) return { left:0, top:0, right:0, bottom:0, width:0, height:0 };
  const xs = points.map(point => Number(point.x || 0));
  const ys = points.map(point => Number(point.y || 0));
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return { left, top, right, bottom, width:Math.max(0, right - left), height:Math.max(0, bottom - top) };
}

function physicalOverlapV1072(a, b) {
  const first = physicalCandidateBoundsV1072(a);
  const second = physicalCandidateBoundsV1072(b);
  const intersectionWidth = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const intersectionHeight = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  const intersection = intersectionWidth * intersectionHeight;
  const areaA = Math.max(1e-6, first.width * first.height);
  const areaB = Math.max(1e-6, second.width * second.height);
  const union = areaA + areaB - intersection;
  const iou = intersection / Math.max(1e-6, union);
  const containment = intersection / Math.max(1e-6, Math.min(areaA, areaB));
  const centerA = { x:(first.left + first.right) / 2, y:(first.top + first.bottom) / 2 };
  const centerB = { x:(second.left + second.right) / 2, y:(second.top + second.bottom) / 2 };
  const centerDistance = Math.hypot(centerA.x - centerB.x, centerA.y - centerB.y);
  const areaRatio = Math.min(areaA, areaB) / Math.max(areaA, areaB);
  return containment >= .54 || iou >= .38 || (centerDistance <= .12 && areaRatio >= .42);
}

function distinctPhysicalCandidatesV1072(candidates = [], preferred = null) {
  const input = (candidates || []).filter(candidate => candidate && !candidate.fullPhoto);
  const ordered = preferred
    ? [preferred, ...input.filter(candidate => candidate.id !== preferred.id)]
    : input;
  const kept = [];
  for (const candidate of ordered) {
    const bounds = physicalCandidateBoundsV1072(candidate);
    if (bounds.width * bounds.height < .025) continue;
    if (kept.some(existing => physicalOverlapV1072(existing, candidate))) continue;
    kept.push(candidate);
  }
  return kept;
}
`;
if (!adapter.includes('function distinctPhysicalCandidatesV1072(')) {
  const classMarker = 'export class WebScannerAdapterV106';
  const index = adapter.indexOf(classMarker);
  if (index < 0) throw new Error('v107.2 adapter class marker missing');
  adapter = `${adapter.slice(0, index)}${adapterHelper}\n${adapter.slice(index)}`;
}
adapter = adapter.replace(
  "const selected = options.scanAll ? selection.candidates.filter(candidate => !candidate.fullPhoto) : [selection.selected || fullPhotoCandidateV106()];",
  "const selected = options.scanAll ? distinctPhysicalCandidatesV1072(selection.candidates, selection.selected) : [selection.selected || fullPhotoCandidateV106()];",
);
adapter = adapter.replace(
  "const selected = (candidates || []).filter(Boolean);\n    if (!selected.length) selected.push(fullPhotoCandidateV106());",
  "const selected = distinctPhysicalCandidatesV1072((candidates || []).filter(Boolean), (candidates || [])[0]);\n    if (!selected.length) selected.push((candidates || []).find(candidate => candidate?.fullPhoto) || fullPhotoCandidateV106());",
);
if (!adapter.includes('distinctPhysicalCandidatesV1072(selection.candidates, selection.selected)')) throw new Error('v107.2 adapter scan-all dedupe missing');
write(adapterPath, adapter);

// 4. Capture UI uses the same physical-page dedupe and always previews enhanced color.
const capturePath = 'source/src/modules/scan/SmartDocumentCaptureV106.jsx';
let capture = read(capturePath);
const captureHelper = `
const DRIVER_PREVIEW_IMAGE_STYLE_V1072 = {
  width:'100%',
  height:'auto',
  maxHeight:'68vh',
  objectFit:'contain',
  display:'block',
  margin:'0 auto',
  background:'#fff',
};

function driverPreviewFileV1072(page = {}) {
  return page?.versions?.enhancedColor?.file
    || page?.versions?.perspectiveCorrected?.file
    || page?.versions?.userAdjustedCrop?.file
    || page?.versions?.ocrSelected?.file
    || page?.versions?.grayscale?.file
    || null;
}

function candidateBoundsV1072(candidate = {}) {
  const direct = candidate.bounds || {};
  if ([direct.left, direct.top, direct.right, direct.bottom].every(Number.isFinite)) return direct;
  const points = Array.isArray(candidate.contour) && candidate.contour.length
    ? candidate.contour
    : [candidate.corners?.topLeft, candidate.corners?.topRight, candidate.corners?.bottomRight, candidate.corners?.bottomLeft].filter(Boolean);
  if (!points.length) return { left:0, top:0, right:0, bottom:0, width:0, height:0 };
  const xs = points.map(point => Number(point.x || 0));
  const ys = points.map(point => Number(point.y || 0));
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return { left, top, right, bottom, width:Math.max(0, right - left), height:Math.max(0, bottom - top) };
}

function samePhysicalDocumentV1072(a, b) {
  const first = candidateBoundsV1072(a);
  const second = candidateBoundsV1072(b);
  const intersectionWidth = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const intersectionHeight = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  const intersection = intersectionWidth * intersectionHeight;
  const areaA = Math.max(1e-6, first.width * first.height);
  const areaB = Math.max(1e-6, second.width * second.height);
  const containment = intersection / Math.max(1e-6, Math.min(areaA, areaB));
  const iou = intersection / Math.max(1e-6, areaA + areaB - intersection);
  const centerDistance = Math.hypot(
    ((first.left + first.right) - (second.left + second.right)) / 2,
    ((first.top + first.bottom) - (second.top + second.bottom)) / 2,
  );
  const areaRatio = Math.min(areaA, areaB) / Math.max(areaA, areaB);
  return containment >= .54 || iou >= .38 || (centerDistance <= .12 && areaRatio >= .42);
}

function distinctDocumentCandidatesV1072(candidates = [], selected = null) {
  const input = (candidates || []).filter(candidate => candidate && !candidate.fullPhoto);
  const ordered = selected
    ? [selected, ...input.filter(candidate => candidate.id !== selected.id)]
    : input;
  const kept = [];
  for (const candidate of ordered) {
    const bounds = candidateBoundsV1072(candidate);
    if (bounds.width * bounds.height < .025) continue;
    if (kept.some(existing => samePhysicalDocumentV1072(existing, candidate))) continue;
    kept.push(candidate);
  }
  return kept;
}
`;
if (!capture.includes('function distinctDocumentCandidatesV1072(')) {
  const exportIndex = capture.indexOf('export default function');
  if (exportIndex < 0) throw new Error('v107.2 capture export marker missing');
  capture = `${capture.slice(0, exportIndex)}${captureHelper}\n${capture.slice(exportIndex)}`;
}
capture = capture.replace(
  "const chosen = scanAll\n        ? visibleCandidates.slice(0, 6).map(candidate => candidate.id === selectedCandidate.id ? preparedCandidate(candidate, contour) : preparedCandidate(candidate, correctionContourV1064(candidate)))\n        : [preparedCandidate(selectedCandidate, contour)];",
  "const physicalCandidatesV1072 = distinctDocumentCandidatesV1072(visibleCandidates, selectedCandidate);\n      const chosen = scanAll\n        ? physicalCandidatesV1072.slice(0, 6).map(candidate => candidate.id === selectedCandidate.id ? preparedCandidate(candidate, contour) : preparedCandidate(candidate, correctionContourV1064(candidate)))\n        : [preparedCandidate(selectedCandidate, contour)];",
);
capture = capture.replace(
  "{visibleCandidates.length > 1 ? <button type=\"button\" className=\"scan-save-v105\" style={{ margin:'0 14px 18px', width:'calc(100% - 28px)' }} onClick={() => processSelection(true)}>Scan all documents in this photo</button> : null}",
  "{distinctDocumentCandidatesV1072(visibleCandidates, selectedCandidate).length > 1 ? <button type=\"button\" className=\"scan-save-v105\" style={{ margin:'0 14px 18px', width:'calc(100% - 28px)' }} onClick={() => processSelection(true)}>Scan all documents in this photo</button> : null}",
);

// Replace the driver-visible cleaned-file choice while leaving ocrSelected for the reader.
const previewMarker = capture.indexOf('setPreviewUrls({ original, cleaned });');
if (previewMarker < 0) throw new Error('v107.2 preview URL marker missing');
const previewWindowStart = Math.max(0, previewMarker - 1800);
const previewWindow = capture.slice(previewWindowStart, previewMarker);
const declarationMatches = [...previewWindow.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]*?\.versions\?\.[^;]+);/g)];
const cleanedMatch = [...declarationMatches].reverse().find(match => /ocrSelected|enhancedColor|perspectiveCorrected/.test(match[2]));
if (!cleanedMatch) throw new Error('v107.2 cleaned preview declaration missing');
const declarationStart = previewWindowStart + cleanedMatch.index;
const declarationEnd = declarationStart + cleanedMatch[0].length;
const pageVariableMatch = cleanedMatch[2].match(/([A-Za-z_$][\w$]*)\?*\.versions/);
if (!pageVariableMatch) throw new Error(`v107.2 preview page variable missing in ${cleanedMatch[2]}`);
capture = `${capture.slice(0, declarationStart)}const ${cleanedMatch[1]} = driverPreviewFileV1072(${pageVariableMatch[1]});${capture.slice(declarationEnd)}`;

capture = capture.replace(
  "<div className=\"turbo-preview-paper\" style={{ display:previewMode === 'compare' ? 'grid' : 'block', gridTemplateColumns:'1fr 1fr', gap:8 }}>",
  "<div className=\"turbo-preview-paper\" style={{ width:'100%', minHeight:'42vh', display:previewMode === 'compare' ? 'grid' : 'grid', gridTemplateColumns:previewMode === 'compare' ? '1fr 1fr' : '1fr', gap:8, alignItems:'center', justifyItems:'center', overflow:'auto', background:'#111' }}>",
);
capture = capture.replace('<img src={previewUrls.original} alt="Original document" />', '<img src={previewUrls.original} alt="Original document" style={DRIVER_PREVIEW_IMAGE_STYLE_V1072} />');
capture = capture.replace('<img src={previewUrls.cleaned} alt="Cleaned document" />', '<img src={previewUrls.cleaned} alt="Cleaned document" style={DRIVER_PREVIEW_IMAGE_STYLE_V1072} />');
capture = capture.replace('<><img src={previewUrls.original} alt="Original document" /><img src={previewUrls.cleaned} alt="Cleaned document" /></>', '<><img src={previewUrls.original} alt="Original document" style={DRIVER_PREVIEW_IMAGE_STYLE_V1072} /><img src={previewUrls.cleaned} alt="Cleaned document" style={DRIVER_PREVIEW_IMAGE_STYLE_V1072} /></>');

if (!capture.includes('physicalCandidatesV1072')) throw new Error('v107.2 capture scan-all dedupe missing');
if (!capture.includes('driverPreviewFileV1072(')) throw new Error('v107.2 enhanced-color preview missing');
if (!capture.includes('style={DRIVER_PREVIEW_IMAGE_STYLE_V1072}')) throw new Error('v107.2 full-size preview style missing');
write(capturePath, capture);

// 5. Reduce over-whitening in the local color enhancement.
const lightweightPath = 'source/src/modules/scan/lightweightDocumentEngineV1071.js';
let lightweight = read(lightweightPath);
lightweight = lightweight.replace(
  "let normalized = clampV1071((luminance / backgroundLuminance) * 244, 0, 255);\n    normalized = clampV1071((normalized - 128) * 1.14 + 132, 0, 255);",
  "const illuminationRatioV1072 = luminance / backgroundLuminance;\n    let normalized = clampV1071(235 + ((illuminationRatioV1072 - 1) * 190), 8, 250);\n    normalized = clampV1071((normalized - 128) * 1.06 + 128, 0, 255); // balanced-enhancement-v1072",
);
if (!lightweight.includes('balanced-enhancement-v1072')) throw new Error('v107.2 balanced enhancement patch missing');
write(lightweightPath, lightweight);

console.log('v107.2 reader, packet dedupe and driver preview patched');
