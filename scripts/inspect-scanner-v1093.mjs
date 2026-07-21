import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanDir = path.join(root, 'source/src/modules/scan');

function read(relative) {
  const target = path.join(root, relative);
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
}

function printMatches(relative, pattern, before = 8, after = 18) {
  const source = read(relative);
  if (!source) {
    console.log(`\n===== MISSING ${relative} =====`);
    return;
  }
  const lines = source.split('\n');
  const indexes = lines
    .map((line, index) => pattern.test(line) ? index : -1)
    .filter(index => index >= 0);
  const wanted = new Set();
  for (const index of indexes) {
    for (let cursor = Math.max(0, index - before); cursor <= Math.min(lines.length - 1, index + after); cursor += 1) {
      wanted.add(cursor);
    }
  }
  console.log(`\n===== ${relative} =====`);
  [...wanted]
    .sort((a, b) => a - b)
    .forEach(index => console.log(`${String(index + 1).padStart(4, '0')}: ${lines[index]}`));
}

console.log('\n===== scan module files =====');
if (fs.existsSync(scanDir)) {
  fs.readdirSync(scanDir).sort().forEach(name => console.log(name));
}

printMatches(
  'source/src/modules/scan/SmartDocumentCaptureV106.jsx',
  /export default|function SmartDocument|onComplete|onCancel|scanbot|professional|OPEN_REVIEW|stage|return \(|data-professional-scanner|originals|cleaned|captureAssets/i,
  12,
  28,
);
printMatches(
  'source/src/modules/scan/SmartDocumentCaptureV100.jsx',
  /SmartDocumentCaptureV106|onComplete|onCancel|scanMeta|ocrFile|return \(/i,
  12,
  24,
);
printMatches(
  'source/src/modules/scan/SmartScanSheetV105.jsx',
  /SmartDocumentCapture|onComplete|scanMeta|ocrFile|captureAssets|saveScannedDocument|persistCaptureAssets/i,
  12,
  26,
);
printMatches(
  'source/src/modules/scan/scanbotRtuV1076.js',
  /export|createDocumentScanner|originals|cleaned|onStatus|loadOriginal|loadDocument|finalRawImage/i,
  10,
  24,
);
printMatches(
  'source/src/modules/scan/scannerContractsV106.js',
  /ROAD_READY_SCANNER_VERSION|export|capture|page|original|clean/i,
  8,
  22,
);
printMatches(
  'source/src/modules/scan/SmartDocumentCaptureV109.jsx',
  /export default|onComplete|onCancel|return \(|scanner/i,
  10,
  24,
);

console.log('\nPASS — scanner integration diagnostic completed');
