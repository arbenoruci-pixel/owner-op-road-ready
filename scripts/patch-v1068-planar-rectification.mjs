import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const write = (relative, content) => fs.writeFileSync(path.join(ROOT, relative), content);

const capturePath = 'source/src/modules/scan/SmartDocumentCaptureV106.jsx';
let capture = read(capturePath);
const captureImport = "import { rectificationPolicyV1068 } from './rectificationPolicyV1068.js'; // safe-planar-v1068";
if (!capture.includes(captureImport)) {
  if (/^['\"]use client['\"];?\r?\n/.test(capture)) {
    capture = capture.replace(/^(['\"]use client['\"];?\r?\n)/, `$1${captureImport}\n`);
  } else {
    capture = `${captureImport}\n${capture}`;
  }
}

const preparedReplacement = `  function preparedCandidate(candidate, editedContour = null) {
    const edited = editedContour ? normalizeContourV106(editedContour) : null;
    const changed = Boolean(edited && candidateDelta(candidate.contour, edited) > .002);
    const next = changed ? candidateWithContourV106(candidate, edited) : candidate;
    const policyInput = {
      ...next,
      contour:edited || next.contour,
      metrics:{ ...(next.metrics || {}) },
    };
    const policy = rectificationPolicyV1068(policyInput, forcedGeometry);
    return {
      ...policyInput,
      manualAdjusted:changed,
      geometryMode:policy.geometryMode,
      rectificationPolicyV1068:policy,
      metrics:{
        ...(policyInput.metrics || {}),
        curvatureScore:policy.useMesh
          ? Math.max(.18, Number(policyInput.metrics?.curvatureScore || 0))
          : policy.geometryMode === 'planar'
            ? 0
            : Number(policyInput.metrics?.curvatureScore || 0),
      },
    };
  }`;
if (!capture.includes('rectificationPolicyV1068:policy')) {
  const startNeedle = '  function preparedCandidate(candidate, editedContour = null) {';
  const endNeedle = '\n  async function processSelection';
  const start = capture.indexOf(startNeedle);
  const end = capture.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`v106.8 missing preparedCandidate boundaries start=${start} end=${end}`);
  }
  capture = `${capture.slice(0, start)}${preparedReplacement}${capture.slice(end)}`;
}
write(capturePath, capture);

const adapterPath = 'source/src/modules/scan/webScannerAdapterV106.js';
let adapter = read(adapterPath);
const adapterImport = "import { rectificationPolicyV1068 } from './rectificationPolicyV1068.js'; // safe-planar-v1068";
if (!adapter.includes(adapterImport)) adapter = `${adapterImport}\n${adapter}`;

if (!adapter.includes("const policy = rectificationPolicyV1068(normalized")) {
  const startNeedle = "      let corrected;\n      let geometryMode = 'planar';";
  const endNeedle = "      if (!normalized.fullPhoto && useMesh) {";
  const start = adapter.indexOf(startNeedle);
  const end = adapter.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`v106.8 missing rectification decision boundaries start=${start} end=${end}`);
  }
  const replacement = `      let corrected;
      const policy = rectificationPolicyV1068(normalized, normalized.geometryMode || 'auto');
      let geometryMode = policy.geometryMode;
      const useMesh = policy.useMesh;
`;
  adapter = `${adapter.slice(0, start)}${replacement}${adapter.slice(end)}`;
}

for (const marker of [
  'safe-planar-v1068',
  'rectificationPolicyV1068:policy',
  "const policy = rectificationPolicyV1068(normalized",
  'const useMesh = policy.useMesh',
]) {
  if (!capture.includes(marker) && !adapter.includes(marker)) throw new Error(`v106.8 missing ${marker}`);
}
write(adapterPath, adapter);
console.log('v106.8 safe planar rectification patched');
