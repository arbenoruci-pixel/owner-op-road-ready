import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'scripts/prepare-v1063-stable-boundary.mjs');
let source = fs.readFileSync(target, 'utf8');

const replacements = [
  {
    before:"  web = replaceOnce(web, oldPaperCandidate, newPaperCandidate, 'paper segmentation robust quadrilateral');",
    after:`  if (!web.includes('const rawContour = contourFromMeshV106(mesh);')) {
    const paperPattern = /const mesh = meshFromComponentV106\\(component, grid, component\\.maxX - component\\.minX > 45 \\? 24 : 16\\);[\\s\\S]*?metrics:regionMetricsV106\\(component, grid, mesh\\),[\\s\\S]*?\\}\\);/;
    if (!paperPattern.test(web)) throw new Error('v106.3 missing paper segmentation robust quadrilateral');
    web = web.replace(paperPattern, newPaperCandidate.trimStart());
  }`,
    label:'paper candidate',
  },
  {
    before:"  capture = replaceOnce(capture, oldLiveLoop, newLiveLoop, 'temporally stable live candidate');",
    after:`  if (!capture.includes('const chosen = chooseLiveCandidateV1063(found, stableRef.current.candidate);')) {
    const livePattern = /const found = await adapter\\(\\)\\.detectDocumentRegions\\(canvas, \\{ maxDimension:560, gridMax:64 \\}\\);[\\s\\S]*?if \\(autoCapture && count >= 4 && !captureBusyRef\\.current\\) capturePage\\(\\);/;
    if (!livePattern.test(capture)) throw new Error('v106.3 missing temporally stable live candidate');
    capture = capture.replace(livePattern, newLiveLoop.trimStart());
  }`,
    label:'live loop',
  },
];

for (const replacement of replacements) {
  if (source.includes(replacement.after)) continue;
  if (!source.includes(replacement.before)) throw new Error(`v106.3 prepatch target missing: ${replacement.label}`);
  source = source.replace(replacement.before, replacement.after);
}
fs.writeFileSync(target, source);
console.log('v106.3 materializer regex prepatch applied');
