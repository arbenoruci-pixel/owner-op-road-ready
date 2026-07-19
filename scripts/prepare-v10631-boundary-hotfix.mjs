import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asset = path.join(ROOT, 'scripts/v106-assets/webScannerAdapterV106.js.gz.b64');
let source = gunzipSync(Buffer.from(fs.readFileSync(asset, 'utf8'), 'base64')).toString('utf8');

const fallbackBefore = '  if (invalid || residual > .045) return boundsContourV1063(fallbackBounds);';
const fallbackAfter = `  if (invalid || residual > .032) {
    const stableTop = clamp01V106(percentileV1063(top.map(point => point.y), .45) - .012);
    const stableBottom = clamp01V106(percentileV1063(bottom.map(point => point.y), .55) + .012);
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
if (!source.includes(fallbackAfter)) {
  if (!source.includes(fallbackBefore)) throw new Error('v106.3 stable-band fallback marker missing');
  source = source.replace(fallbackBefore, fallbackAfter);
}

const bandBefore = `  const topBand = percentileV1063(top.map(point => point.y), .2);
  const bottomBand = percentileV1063(bottom.map(point => point.y), .8);
  contour = contour.map((point, index) => ({
    x:clamp01V106(point.x + (index === 0 || index === 3 ? -.004 : .004)),
    y:clamp01V106(index < 2 ? Math.min(point.y, topBand + .012) - .004 : Math.max(point.y, bottomBand - .012) + .004),
  }));`;
const bandAfter = `  const topBand = percentileV1063(top.map(point => point.y), .45);
  const bottomBand = percentileV1063(bottom.map(point => point.y), .55);
  contour = contour.map((point, index) => ({
    x:clamp01V106(point.x + (index === 0 || index === 3 ? -.004 : .004)),
    y:clamp01V106(index < 2 ? Math.max(point.y, topBand - .018) - .004 : Math.min(point.y, bottomBand + .018) + .004),
  }));`;
if (!source.includes(bandAfter)) {
  if (!source.includes(bandBefore)) throw new Error('v106.3 robust-band clamp marker missing');
  source = source.replace(bandBefore, bandAfter);
}

fs.writeFileSync(asset, gzipSync(Buffer.from(source), { mtime:0 }).toString('base64'));
console.log('v106.3 stable-band boundary fallback prepared');
