import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetPath = path.join(ROOT, 'scripts/v106-assets/SmartDocumentCaptureV106.jsx.gz.b64');
let source = gunzipSync(Buffer.from(fs.readFileSync(assetPath, 'utf8'), 'base64')).toString('utf8');

const importLine = "import { correctionContourV1064 } from './correctionContourV1064.js'; // correction-contour-v1064";
if (!source.includes(importLine)) {
  const directive = source.match(/^(?:'use client'|"use client");\s*/)?.[0] || '';
  source = directive
    ? `${directive}${importLine}\n${source.slice(directive.length)}`
    : `${importLine}\n${source}`;
}

if (!source.includes('const firstContourV1064 = correctionContourV1064(first);')) {
  const initialSelectionPattern = /(\n\s*setCandidates\(found\);\n)(\s*setSelectedCandidateId\(first\?\.id\s*\|\|\s*['"]{2}\);)/;
  if (!initialSelectionPattern.test(source)) throw new Error('v106.4 missing initial candidate state block');
  source = source.replace(
    initialSelectionPattern,
    `$1        const firstContourV1064 = correctionContourV1064(first);\n$2`,
  );
}
source = source.replace(/setAutomaticContour\(first\?\.contour\s*\|\|\s*\[\]\);/, 'setAutomaticContour(firstContourV1064);');
source = source.replace(/setContour\(first\?\.contour\s*\|\|\s*\[\]\);/, 'setContour(firstContourV1064);');

if (!source.includes('const nextContourV1064 = correctionContourV1064(candidate);')) {
  const selectPattern = /function selectCandidate\(candidate\) \{\n(?:\s+const[^\n]+\n)?\s+setSelectedCandidateId\(candidate\.id\);\n\s+setAutomaticContour\([^\n]+\);\n\s+setContour\([^\n]+\);/;
  if (!selectPattern.test(source)) throw new Error('v106.4 missing candidate selection block');
  source = source.replace(selectPattern, `function selectCandidate(candidate) {\n    const nextContourV1064 = correctionContourV1064(candidate);\n    setSelectedCandidateId(candidate.id);\n    setAutomaticContour(nextContourV1064);\n    setContour(nextContourV1064);`);
}

source = source.replace(
  'candidate.id === selectedCandidate.id ? preparedCandidate(candidate, contour) : preparedCandidate(candidate)',
  'candidate.id === selectedCandidate.id ? preparedCandidate(candidate, contour) : preparedCandidate(candidate, correctionContourV1064(candidate))',
);

for (const marker of [
  'correction-contour-v1064',
  'const firstContourV1064 = correctionContourV1064(first);',
  'setAutomaticContour(firstContourV1064);',
  'setContour(firstContourV1064);',
  'const nextContourV1064 = correctionContourV1064(candidate);',
]) {
  if (!source.includes(marker)) throw new Error(`v106.4 verification missing ${marker}`);
}

fs.writeFileSync(assetPath, gzipSync(Buffer.from(source), { mtime:0 }).toString('base64'));
console.log('v106.4 four-corner correction contour prepared');
