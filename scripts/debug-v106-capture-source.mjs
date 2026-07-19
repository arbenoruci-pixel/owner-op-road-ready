import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function snippet(relative, needle, radius = 2600) {
  const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const index = source.indexOf(needle);
  if (index < 0) {
    console.log(`V106 DEBUG missing ${needle} in ${relative}`);
    return;
  }
  const start = Math.max(0, index - radius);
  const end = Math.min(source.length, index + needle.length + radius);
  console.log(`\nV106 DEBUG START ${relative} :: ${needle}\n${source.slice(start, end)}\nV106 DEBUG END\n`);
}

for (const needle of [
  'function boundingCandidateFromMaskV106',
  'function paperCandidatesV106',
  'candidates.push(...paperCandidatesV106(grid));',
  "'text-density'",
]) snippet('source/src/modules/scan/webScannerAdapterV106.js', needle);

for (const needle of [
  'function selectCandidate(candidate)',
  "stage === 'correction'",
  'candidate.label',
]) snippet('source/src/modules/scan/SmartDocumentCaptureV106.jsx', needle, 1800);
