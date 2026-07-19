import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'scripts/prepare-v1063-stable-boundary.mjs');
let source = fs.readFileSync(target, 'utf8');
const before = "  web = replaceOnce(web, oldPaperCandidate, newPaperCandidate, 'paper segmentation robust quadrilateral');";
const after = `  if (!web.includes('const rawContour = contourFromMeshV106(mesh);')) {
    const paperPattern = /const mesh = meshFromComponentV106\\(component, grid, component\\.maxX - component\\.minX > 45 \\? 24 : 16\\);[\\s\\S]*?metrics:regionMetricsV106\\(component, grid, mesh\\),[\\s\\S]*?\\}\\);/;
    if (!paperPattern.test(web)) throw new Error('v106.3 missing paper segmentation robust quadrilateral');
    web = web.replace(paperPattern, newPaperCandidate.trimStart());
  }`;
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('v106.3 prepatch target missing');
  source = source.replace(before, after);
  fs.writeFileSync(target, source);
}
console.log('v106.3 materializer regex prepatch applied');
