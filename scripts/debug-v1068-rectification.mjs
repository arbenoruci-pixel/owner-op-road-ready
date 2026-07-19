import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'source/src/modules/scan/webScannerAdapterV106.js',
  'source/src/modules/scan/SmartDocumentCaptureV106.jsx',
];
const needles = [
  'async rectifyCandidate',
  'rectifyCandidate(',
  'meshWarp',
  'dewarp',
  'geometryMode',
  'curvatureScore',
  'processSelection',
  'rectified',
  'perspective',
];
for (const relative of files) {
  const full = path.join(ROOT, relative);
  if (!fs.existsSync(full)) {
    console.log(`V1068 DEBUG missing file ${relative}`);
    continue;
  }
  const source = fs.readFileSync(full, 'utf8');
  console.log(`V1068 DEBUG FILE ${relative} length=${source.length}`);
  for (const needle of needles) {
    let offset = 0;
    let count = 0;
    while (count < 4) {
      const index = source.indexOf(needle, offset);
      if (index < 0) break;
      const start = Math.max(0, index - 1800);
      const end = Math.min(source.length, index + needle.length + 3200);
      console.log(`\nV1068 DEBUG START ${relative} :: ${needle} :: ${index}\n${source.slice(start, end)}\nV1068 DEBUG END\n`);
      offset = index + needle.length;
      count += 1;
    }
  }
}
