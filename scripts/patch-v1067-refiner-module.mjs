import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'source/src/modules/scan/refinePaperCornersV1067.js');
let source = fs.readFileSync(target, 'utf8');
const before = "  let values = points.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));";
const after = "  let values = points\n    .map(point => ({ x:Number(point?.x ?? point?.u), y:Number(point?.y ?? point?.v) }))\n    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));";
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('v106.7 rotated-coordinate normalization marker missing');
  source = source.replace(before, after);
}
fs.writeFileSync(target, source);
console.log('v106.7 rotated boundary coordinates normalized');
