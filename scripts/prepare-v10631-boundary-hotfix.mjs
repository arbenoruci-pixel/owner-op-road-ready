import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asset = path.join(ROOT, 'scripts/v106-assets/webScannerAdapterV106.js.gz.b64');
let source = gunzipSync(Buffer.from(fs.readFileSync(asset, 'utf8'), 'base64')).toString('utf8');
const before = '  if (invalid || residual > .045) return boundsContourV1063(fallbackBounds);';
const after = `  if (invalid || residual > .045) {
    const stableTop = clamp01V106(percentileV1063(top.map(point => point.y), .4) - .012);
    const stableBottom = clamp01V106(percentileV1063(bottom.map(point => point.y), .6) + .012);
    const fallbackLeft = clamp01V106(Math.min(left, Number(fallbackBounds.left || left)) - .004);
    const fallbackRight = clamp01V106(Math.max(right, Number(fallbackBounds.right || right)) + .004);
    if (stableBottom - stableTop >= .16) {
      return [
        { x:fallbackLeft, y:stableTop },
        { x:fallbackRight, y:stableTop },
        { x:fallbackRight, y:stableBottom },
        { x:fallbackLeft, y:stableBottom },
      ];
    }
    return boundsContourV1063(fallbackBounds);
  }`;
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('v106.3 stable-band fallback marker missing');
  source = source.replace(before, after);
}
fs.writeFileSync(asset, gzipSync(Buffer.from(source), { mtime:0 }).toString('base64'));
console.log('v106.3 stable-band boundary fallback prepared');
