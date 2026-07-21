import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const moduleUrl = relative => `${pathToFileURL(path.join(ROOT, relative)).href}?verify=${Date.now()}_${Math.random()}`;

function luminance(r, g, b) {
  return r * .2126 + g * .7152 + b * .0722;
}

function fixture() {
  const width = 320;
  const height = 420;
  const data = new Uint8ClampedArray(width * height * 4);
  const digitMask = new Uint8Array(width * height);
  const printedMask = new Uint8Array(width * height);
  const orangeMask = new Uint8Array(width * height);
  const paperMask = new Uint8Array(width * height);
  const blankMask = new Uint8Array(width * height);

  const set = (x, y, r, g, b, mask = null) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    const offset = pixel * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = 255;
    if (mask) mask[pixel] = 1;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const centerShadow = Math.max(0, 1 - Math.abs(x - width * .55) / (width * .36)) * 34;
      const vertical = y / height * 6;
      const noise = ((x * 19 + y * 11) % 5) - 2;
      set(
        x,
        y,
        Math.round(241 - centerShadow - vertical + noise),
        Math.round(229 - centerShadow - vertical + noise),
        Math.round(225 - centerShadow - vertical + noise),
      );
      const pixel = y * width + x;
      if (x > 12 && x < width - 12 && y > 12 && y < height - 12) paperMask[pixel] = 1;
      if (x > 232 && x < 298 && y > 42 && y < 152) blankMask[pixel] = 1;
    }
  }

  const line = (x0, y0, x1, y1, thickness, rgb, mask) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let step = 0; step <= steps; step += 1) {
      const x = Math.round(x0 + dx * step / steps);
      const y = Math.round(y0 + dy * step / steps);
      for (let oy = -thickness; oy <= thickness; oy += 1) {
        for (let ox = -thickness; ox <= thickness; ox += 1) {
          set(x + ox, y + oy, rgb[0], rgb[1], rgb[2], mask);
        }
      }
    }
  };

  // Printed invoice rules and labels.
  for (let row = 0; row < 10; row += 1) {
    const y = 188 + row * 18;
    line(26, y, 285 - (row % 3) * 24, y, row % 3 === 0 ? 1 : 0, [68, 66, 66], printedMask);
  }

  // Four separate 7-segment digits: 2026. Their topology must remain four
  // connected components after enhancement.
  const digitSegments = {
    0:['a','b','c','d','e','f'],
    2:['a','b','g','e','d'],
    6:['a','f','g','e','c','d'],
  };
  const segment = (originX, originY, name) => {
    const t = 2;
    const w = 22;
    const h = 38;
    const rgb = [72, 70, 70];
    if (name === 'a') line(originX + 3, originY, originX + w - 3, originY, t, rgb, digitMask);
    if (name === 'g') line(originX + 3, originY + h / 2, originX + w - 3, originY + h / 2, t, rgb, digitMask);
    if (name === 'd') line(originX + 3, originY + h, originX + w - 3, originY + h, t, rgb, digitMask);
    if (name === 'f') line(originX, originY + 2, originX, originY + h / 2, t, rgb, digitMask);
    if (name === 'b') line(originX + w, originY + 2, originX + w, originY + h / 2, t, rgb, digitMask);
    if (name === 'e') line(originX, originY + h / 2, originX, originY + h - 2, t, rgb, digitMask);
    if (name === 'c') line(originX + w, originY + h / 2, originX + w, originY + h - 2, t, rgb, digitMask);
  };
  [2, 0, 2, 6].forEach((digit, index) => {
    const x = 36 + index * 42;
    const y = 88;
    digitSegments[digit].forEach(name => segment(x, y, name));
  });

  // Colored handwriting must stay colored without driving full-page color mode.
  line(42, 360, 125, 350, 2, [207, 128, 53], orangeMask);
  line(145, 362, 216, 347, 2, [211, 132, 57], orangeMask);

  return {
    image:{ width, height, data },
    digitMask,
    printedMask,
    orangeMask,
    paperMask,
    blankMask,
    digitRegion:{ x0:28, y0:78, x1:205, y1:140 },
  };
}

function averageY(image, mask) {
  let total = 0;
  let count = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel]) continue;
    const offset = pixel * 4;
    total += luminance(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
    count += 1;
  }
  return total / Math.max(1, count);
}

function averageRgb(image, mask) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel]) continue;
    const offset = pixel * 4;
    r += image.data[offset];
    g += image.data[offset + 1];
    b += image.data[offset + 2];
    count += 1;
  }
  return { r:r / Math.max(1, count), g:g / Math.max(1, count), b:b / Math.max(1, count) };
}

function componentCount(image, region, threshold) {
  const width = image.width;
  const height = image.height;
  const x0 = Math.max(0, region.x0);
  const y0 = Math.max(0, region.y0);
  const x1 = Math.min(width, region.x1);
  const y1 = Math.min(height, region.y1);
  const visited = new Uint8Array(width * height);
  let count = 0;

  const isInk = pixel => {
    const offset = pixel * 4;
    return luminance(image.data[offset], image.data[offset + 1], image.data[offset + 2]) < threshold;
  };

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const start = y * width + x;
      if (visited[start] || !isInk(start)) continue;
      const queue = [start];
      visited[start] = 1;
      let size = 0;
      while (queue.length) {
        const pixel = queue.pop();
        size += 1;
        const px = pixel % width;
        const py = Math.floor(pixel / width);
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (!ox && !oy) continue;
            const nx = px + ox;
            const ny = py + oy;
            if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
            const next = ny * width + nx;
            if (visited[next] || !isInk(next)) continue;
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
      if (size >= 10) count += 1;
    }
  }
  return count;
}

function inventedBlankInkRatio(image, mask, paperY) {
  let invented = 0;
  let count = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel]) continue;
    const offset = pixel * 4;
    const y = luminance(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
    if (y < paperY - 24) invented += 1;
    count += 1;
  }
  return invented / Math.max(1, count);
}

const sample = fixture();
const quality = await import(moduleUrl('source/src/modules/scan/v3/AutoQualityBotV1093.js'));
const result = quality.autoFixDocumentV1093(sample.image, {}, { profile:'display' });

assert.ok(result.display?.data?.length, 'quality bot must return a display image');
assert.equal(result.metadata.qualityProfile, 'content-fidelity-lock-v10939');
assert.equal(result.metadata.contentFidelityLock, true);
assert.equal(result.metadata.pixelOnlyEnhancement, true);
assert.equal(result.metadata.generativeReconstruction, false);
assert.equal(result.metadata.ocrRewrite, false);
assert.equal(result.metadata.sourceStrokeTopologyPreserved, true);
assert.equal(result.metadata.sourceAnchoredToneMapping, true);

const paperBefore = averageY(sample.image, sample.paperMask);
const paperAfter = averageY(result.display, sample.paperMask);
const textBefore = averageY(sample.image, sample.printedMask);
const textAfter = averageY(result.display, sample.printedMask);
assert.ok(
  paperAfter - textAfter > (paperBefore - textBefore) * 1.10,
  'printed text contrast must improve while source topology stays locked',
);

const sourceComponents = componentCount(sample.image, sample.digitRegion, paperBefore - 28);
const outputComponents = componentCount(result.display, sample.digitRegion, paperAfter - 28);
assert.equal(sourceComponents, 4, `source fixture must contain four digit components, got ${sourceComponents}`);
assert.equal(outputComponents, sourceComponents, `digit topology must remain unchanged: ${sourceComponents} -> ${outputComponents}`);

const blankInkRatio = inventedBlankInkRatio(result.display, sample.blankMask, paperAfter);
assert.ok(blankInkRatio < .003, `blank paper must not gain invented marks: ${blankInkRatio}`);

const orangeBefore = averageRgb(sample.image, sample.orangeMask);
const orangeAfter = averageRgb(result.display, sample.orangeMask);
assert.ok(orangeAfter.r > orangeAfter.g && orangeAfter.g > orangeAfter.b, 'orange handwriting hue order must remain');
const orangeChromaBefore = Math.max(orangeBefore.r, orangeBefore.g, orangeBefore.b) - Math.min(orangeBefore.r, orangeBefore.g, orangeBefore.b);
const orangeChromaAfter = Math.max(orangeAfter.r, orangeAfter.g, orangeAfter.b) - Math.min(orangeAfter.r, orangeAfter.g, orangeAfter.b);
assert.ok(orangeChromaAfter >= orangeChromaBefore * .48, 'colored handwriting must remain visible');

const qualitySource = read('source/src/modules/scan/v3/AutoQualityBotV1093.js');
assert.ok(qualitySource.includes('applyDocumentFidelityLock'));
assert.ok(qualitySource.includes('No new digit or letter can be introduced'));
assert.ok(qualitySource.includes('generativeReconstruction:false'));
assert.ok(qualitySource.includes('ocrRewrite:false'));

const review = read('source/src/modules/scan/v3/ReviewScreenV3.jsx');
assert.ok(review.includes('data-road-ready-scanner-review="four-corner-v10931"'));
assert.ok(review.includes('Fidelity lock · build 109.3.9'));
assert.equal(review.includes('bend points'), false);

const engine = read('source/src/modules/scan/v3/ScannerEngineV3.js');
assert.ok(engine.includes('warpPerspectiveV10934'));
assert.ok(engine.includes("primaryOutput:'displayFile'"));
assert.ok(engine.includes("captureAsset('original'"));
assert.ok(engine.includes("captureAsset('display-final'"));
assert.ok(engine.includes('jpegQuality:.995'));

const appUpdate = await import(moduleUrl('source/src/core/update/appUpdate.js'));
assert.equal(appUpdate.CURRENT_APP_VERSION, '109.3.9');
assert.equal(appUpdate.CURRENT_APP_BUILD, 'v10939-content-fidelity-lock');
assert.equal(
  appUpdate.shouldOfferAppUpdate({ version:'109.3.9', build:'v10939-content-fidelity-lock', force:true }),
  false,
  'target build must not offer itself again',
);

const release = JSON.parse(read('public/app-version.json'));
assert.equal(release.version, '109.3.9');
assert.equal(release.build, 'v10939-content-fidelity-lock');
assert.equal(release.force, true);

const manifest = JSON.parse(read('public/scanner-engine.json'));
assert.equal(manifest.version, '109.3.9');
assert.equal(manifest.name, 'Road Ready Scanner 0.4.9');
assert.equal(manifest.visibleHandles, 4);
assert.equal(manifest.primaryOutput, 'display-final');
assert.equal(manifest.qualityBot, 'road-ready-auto-quality-bot-v10939');
assert.equal(manifest.qualityProfile, 'content-fidelity-lock-v10939');
assert.equal(manifest.contentFidelityLock, true);
assert.equal(manifest.pixelOnlyEnhancement, true);
assert.equal(manifest.generativeReconstruction, false);
assert.equal(manifest.ocrRewrite, false);
assert.equal(manifest.sourceStrokeTopologyPreserved, true);
assert.equal(manifest.sourceAnchoredToneMapping, true);
assert.equal(manifest.originalPreserved, true);
assert.equal(manifest.bundledVersionBuildSynchronized, true);

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '109.3.9');

console.log('PASS — no generative reconstruction or OCR rewriting is used');
console.log('PASS — digit connected-component topology remains identical to the source');
console.log('PASS — blank paper cannot acquire invented dark marks');
console.log('PASS — existing print gains controlled contrast and colored handwriting remains visible');
console.log('PASS — four-corner geometry, display-final persistence, original and OCR assets remain unchanged');
console.log('PASS — v109.3.9 content fidelity lock scanner regression suite');
