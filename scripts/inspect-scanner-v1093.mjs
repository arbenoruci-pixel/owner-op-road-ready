import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanDir = path.join(root, 'source/src/modules/scan');

function read(relative) {
  const target = path.join(root, relative);
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
}

function walk(directory, prefix = '') {
  if (!fs.existsSync(directory)) return [];
  const found = [];
  for (const name of fs.readdirSync(directory).sort()) {
    const absolute = path.join(directory, name);
    const relative = path.join(prefix, name);
    if (fs.statSync(absolute).isDirectory()) found.push(...walk(absolute, relative));
    else found.push(relative.replaceAll('\\', '/'));
  }
  return found;
}

function printWhole(relative, maxLines = 700) {
  const source = read(relative);
  console.log(`\n===== WHOLE ${relative} =====`);
  if (!source) {
    console.log('MISSING');
    return;
  }
  source.split('\n').slice(0, maxLines).forEach((line, index) => {
    console.log(`${String(index + 1).padStart(4, '0')}: ${line}`);
  });
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

console.log('\n===== scan module files recursive =====');
walk(scanDir).forEach(name => console.log(name));

printWhole('source/src/modules/scan/SmartDocumentCaptureV100.jsx', 500);

for (const relativeName of walk(path.join(scanDir, 'v3'), 'source/src/modules/scan/v3')) {
  if (/\.(jsx?|mjs)$/.test(relativeName)) {
    printMatches(
      relativeName,
      /export default|export function|function |onReady|onClose|onComplete|onCancel|captureAssets|captureManifest|ocrFile|displayFile|File\(|Blob\(|return \(|stage|review|boundary|handle|quality|import|camera/i,
      10,
      30,
    );
  }
}

printMatches(
  'source/src/modules/scan/SmartScanSheetV105.jsx',
  /SmartDocumentCapture|onReady|chooseFile|scanMeta|ocrFile|displayFile|captureAssets|captureManifest|persistCaptureAssets/i,
  12,
  30,
);
printMatches(
  'source/src/modules/scan/scannerContractsV106.js',
  /ROAD_READY_SCANNER_VERSION|createScannedPacket|serializablePacketManifest|capture|page|original|clean/i,
  8,
  24,
);

console.log('\nPASS — expanded scanner integration diagnostic completed');
