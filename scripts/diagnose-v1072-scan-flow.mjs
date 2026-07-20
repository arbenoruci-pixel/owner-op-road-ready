import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scanDir = path.join(ROOT, 'source/src/modules/scan');
const needles = [
  'loadDocumentVision',
  'Loading local scan engine',
  'Loading smart edges',
  'scanAll',
  'scan all',
  'multiDocument',
  'documentCandidates',
  'candidates.slice',
  'renderDocumentFile',
  'detectDocumentRegions',
  'previewUrls',
  'turbo-preview-paper',
];

function walk(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes:true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(absolute));
    else if (/\.(js|jsx|mjs|ts|tsx|css)$/.test(entry.name)) output.push(absolute);
  }
  return output;
}

function printRange(relative, start, end) {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) return;
  const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
  console.log(`=== RANGE ${relative}:${start}-${end} ===`);
  for (let index = Math.max(0, start - 1); index < Math.min(lines.length, end); index += 1) {
    console.log(`${index + 1}: ${lines[index].slice(0, 360)}`);
  }
}

console.log('=== v107.2 scan-flow diagnostics ===');
for (const absolute of walk(scanDir)) {
  const relative = path.relative(ROOT, absolute);
  const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
  const hits = [];
  lines.forEach((line, index) => {
    if (needles.some(needle => line.toLowerCase().includes(needle.toLowerCase()))) {
      hits.push(`${index + 1}: ${line.trim().slice(0, 260)}`);
    }
  });
  if (hits.length) {
    console.log(`--- ${relative}`);
    hits.slice(0, 100).forEach(hit => console.log(hit));
  }
}
printRange('source/src/modules/scan/SmartDocumentCaptureV106.jsx', 520, 700);
printRange('source/src/modules/scan/SmartDocumentCaptureV106.jsx', 780, 840);
printRange('source/src/modules/scan/webScannerAdapterV106.js', 700, 940);
printRange('source/src/modules/scan/smartScanPro.js', 210, 310);
printRange('source/src/modules/scan/smartScanProV989.js', 480, 550);
console.log('=== end v107.2 scan-flow diagnostics ===');
