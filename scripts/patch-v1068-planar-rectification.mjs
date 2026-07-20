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
  if (/^['\"]use client['\"];?\n/.test(capture)) {
    capture = capture.replace(/^(['\"]use client['\"];?\n)/, `$1${captureImport}\n`);
  } else {
    capture = `${captureImport}\n${capture}`;
  }
}

const preparedPattern = /  function preparedCandidate\(candidate, editedContour = null\) \{[\s\S]*?\n  \}(?=\n  async function processSelection)/;
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
  if (!preparedPattern.test(capture)) throw new Error('v106.8 missing preparedCandidate block');
  capture = capture.replace(preparedPattern, preparedReplacement);
}
write(capturePath, capture);

const adapterPath = 'source/src/modules/scan/webScannerAdapterV106.js';
let adapter = read(adapterPath);
const adapterImport = "import { rectificationPolicyV1068 } from './rectificationPolicyV1068.js'; // safe-planar-v1068";
if (!adapter.includes(adapterImport)) adapter = `${adapterImport}\n${adapter}`;

const meshPattern = /      let corrected;\n      let geometryMode = 'planar';\n      const useMesh = normalized\.geometryMode === 'mesh'\n        \|\| normalized\.geometryMode !== 'planar' && Number\(normalized\.metrics\?\.curvatureScore \|\| 0\) > \.12;/;
const meshReplacement = `      let corrected;
      const policy = rectificationPolicyV1068(normalized, normalized.geometryMode || 'auto');
      let geometryMode = policy.geometryMode;
      const useMesh = policy.useMesh;`;
if (!adapter.includes("const policy = rectificationPolicyV1068(normalized")) {
  if (!meshPattern.test(adapter)) throw new Error('v106.8 missing rectification mesh decision');
  adapter = adapter.replace(meshPattern, meshReplacement);
}

adapter = adapter.replace(
  "          corrected = await meshDewarpFileV106(file, normalized.mesh, { name:options.name || `road-ready-dewarped-${Date.now()}.jpg` });\n          geometryMode = 'mesh';",
  "          corrected = await meshDewarpFileV106(file, normalized.mesh, { name:options.name || `road-ready-dewarped-${Date.now()}.jpg` });\n          geometryMode = 'mesh';",
);

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
