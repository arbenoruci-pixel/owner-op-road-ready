import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'source/src/modules/scan/SmartDocumentCaptureV106.jsx');
let source = fs.readFileSync(target, 'utf8');

const importLine = "import { refinePaperCandidateV1067 } from './refinePaperCornersV1067.js'; // angle-aware-paper-v1067";
if (!source.includes(importLine)) {
  const photoFirstImport = /import \{ selectPhotoFirstCandidateV1065 \} from '\.\/photoFirstCandidateV1065\.js';[^\n]*\n/;
  if (photoFirstImport.test(source)) source = source.replace(photoFirstImport, match => `${match}${importLine}\n`);
  else source = `${importLine}\n${source}`;
}

if (!source.includes('const automaticFirstV1067 = selectPhotoFirstCandidateV1065(found)')) {
  const pattern = /const first = selectPhotoFirstCandidateV1065\(found\) \|\| found\[0\] \|\| null;[\s\S]{0,420}?setCandidates\(found\);[\s\S]{0,260}?setSelectedCandidateId\(first\?\.id \|\| ''\);[\s\S]{0,260}?setAutomaticContour\([^\n]+\);[\s\S]{0,120}?setContour\([^\n]+\);/;
  if (!pattern.test(source)) throw new Error('v106.7 missing photo-first selection block');
  source = source.replace(pattern, `const automaticFirstV1067 = selectPhotoFirstCandidateV1065(found) || found[0] || null;
        const first = automaticFirstV1067 ? await refinePaperCandidateV1067(image, automaticFirstV1067) : null;
        const refinedCandidatesV1067 = first && first.id !== automaticFirstV1067?.id
          ? [first, ...found]
          : found;
        setCandidates(refinedCandidatesV1067);
        setSelectedCandidateId(first?.id || '');
        setAutomaticContour(first?.contour || []);
        setContour(first?.contour || []);`);
}

source = source.replace(
  "setStatus(first ? 'Paper selected from one photo' : 'Check the photo');",
  "setStatus(first?.metrics?.angleRefinedV1067 ? 'Paper angle found — it will be straightened' : first ? 'Paper selected from one photo' : 'Check the photo');",
);

for (const marker of [
  'angle-aware-paper-v1067',
  'await refinePaperCandidateV1067(image, automaticFirstV1067)',
  'angleRefinedV1067',
]) {
  if (!source.includes(marker)) throw new Error(`v106.7 verification missing ${marker}`);
}

fs.writeFileSync(target, source);
console.log('v106.7 angle-aware still-photo refinement patched');
