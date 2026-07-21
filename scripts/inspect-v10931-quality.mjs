import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function printMatches(relative, patterns, before = 18, after = 90) {
  const target = path.join(ROOT, relative);
  if (!fs.existsSync(target)) {
    console.log(`MISSING ${relative}`);
    return;
  }
  const lines = fs.readFileSync(target, 'utf8').split(/\r?\n/);
  const indexes = [];
  lines.forEach((line, index) => {
    if (patterns.some(pattern => pattern.test(line))) indexes.push(index);
  });
  const selected = new Set();
  for (const index of indexes) {
    for (let cursor = Math.max(0, index - before); cursor <= Math.min(lines.length - 1, index + after); cursor += 1) {
      selected.add(cursor);
    }
  }
  console.log(`\n===== ${relative} =====`);
  [...selected].sort((a, b) => a - b).forEach(index => {
    console.log(`${String(index + 1).padStart(4, '0')}: ${lines[index]}`);
  });
}

printMatches(
  'source/src/modules/scan/v3/PerspectiveEngineV3.js',
  [/warpPerspectiveV3/, /outputSize/, /targetWidth/, /targetHeight/, /homography/, /minShortSide/, /maxDimension/],
  24,
  120,
);
printMatches(
  'source/src/modules/scan/v3/RestoreEngineV3.js',
  [/restoreDocumentV3/, /localContrast/, /sharpen/, /grayscale/, /highContrast/, /color/],
  20,
  120,
);
printMatches(
  'source/src/modules/scan/v3/imageUtilsV3.js',
  [/decodeImageFileV3/, /imageDataToFileV3/, /toBlob/, /canvas/, /maxDimension/, /quality/],
  20,
  120,
);
printMatches(
  'source/src/modules/scan/scanStorage.js',
  [/saveScannedDocument/, /dataUrl/, /file/, /blob/, /preview/],
  20,
  120,
);
printMatches(
  'source/src/modules/documents/DocumentViewer.jsx',
  [/img/, /objectFit/, /dataUrl/, /document/],
  15,
  80,
);
console.log('PASS — v109.3.1 scanner quality diagnostic complete');
