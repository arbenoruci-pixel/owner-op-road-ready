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
];

function walk(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes:true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(absolute));
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(entry.name)) output.push(absolute);
  }
  return output;
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
    hits.slice(0, 80).forEach(hit => console.log(hit));
  }
}
console.log('=== end v107.2 scan-flow diagnostics ===');
