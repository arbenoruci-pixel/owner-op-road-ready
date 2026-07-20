import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function printRange(relative, start, end) {
  const absolute = path.join(ROOT, relative);
  const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
  console.log(`=== V1073 RANGE ${relative}:${start}-${end} ===`);
  for (let index = Math.max(0, start - 1); index < Math.min(lines.length, end); index += 1) {
    console.log(`${index + 1}: ${lines[index].slice(0, 520)}`);
  }
}
printRange('source/src/modules/scan/SmartDocumentCaptureV106.jsx', 180, 250);
printRange('source/src/modules/scan/SmartDocumentCaptureV106.jsx', 385, 415);
printRange('source/src/modules/scan/lightweightDocumentEngineV1071.js', 250, 355);
printRange('source/src/modules/scan/documentScannerEngine.js', 455, 480);
