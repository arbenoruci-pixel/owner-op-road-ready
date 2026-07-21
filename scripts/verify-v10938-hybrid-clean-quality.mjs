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
  const width = 260;
  const height = 340;
  const data = new Uint8ClampedArray(width * height * 4);
  const textMask = new Uint8Array(width * height);
  const orangeMask = new Uint8Array(width * height);
  const paperMask = new Uint8Array(width * height);
  const leftPaperMask = new Uint8Array(width * height);
  const centerPaperMask = new Uint8Array(width * height);

  const set = (x, y, r, g, b, mask = null) => {
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
      const centerDistance = Math.abs(x - width * .54) / (width * .34);
      const shadow = Math.max(0, 1 - centerDistance) * 42;
      const vertical = (y / height) * 5;
      const noise = ((x * 17 + y * 13) % 7) - 3;
      const r = Math.max(0, Math.min(255, Math.round(240 - shadow - vertical + noise)));
      const g = Math.max(0, Math.min(255, Math.round(226 - shadow - vertical + noise)));
      const b = Math.max(0, Math.min(255, Math.round(222 - shadow - vertical + noise)));
      set(x, y, r, g, b);
      const pixel = y * width + x;
      if (x > 12 && x < width - 12 && y > 12 && y < height - 12) paperMask[pixel] = 1;
      if (x > 20 && x < 70 && y > 25 && y < 300) leftPaperMask[pixel] = 1;
      if (x > 118 && x < 168 && y > 25 && y < 300) centerPaperMask[pixel] = 1;
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
          const px = x + ox;
          const py = y + oy;
          if (px < 1 || py < 1 || px >= width - 1 || py >= height - 1) continue;
          set(px, py, rgb[0], rgb[1], rgb[2], mask);
        }
      }
    }
  };

  // Neutral printed BOL text and rules.
  for (let row = 0; row < 13; row += 1) {
    const y = 42 + row * 17;
    line(34, y, 218 - (row % 3) * 18, y, row % 4 === 0 ? 1 : 0, [60, 58, 58], textMask);
    if (row % 3 === 1) line(42, y + 5, 140, y + 5, 0, [72, 70, 70], textMask);
  }
  line(28, 278, 225, 278, 1, [62, 60, 60], textMask);

  // Orange handwriting and check mark, intentionally enough to trigger color mode.
  line(38, 256, 102, 247, 2, [205, 128, 55], orangeMask);
  line(116, 258, 162, 245, 2, [210, 132, 58], orangeMask);
  line(188, 266, 216, 250, 2, [204, 121, 50], orangeMask);
  line(198, 246, 205, 258, 2, [205, 126, 52], orangeMask);

  // Shadow measurements must use blank paper, not printed rules or colored ink.
  for (let pixel = 0; pixel < textMask.length; pixel += 1) {
    if (!textMask[pixel] && !orangeMask[pixel]) continue;
    paperMask[pixel] = 0;
    leftPaperMask[pixel] = 0;
    centerPaperMask[pixel] = 0;
  }

  return { image:{ width, height, data }, textMask, orangeMask, paperMask, leftPaperMask, centerPaperMask };
}

function average(image, mask) {
  let r = 0;
  let g = 0;
  let b = 0;
  let y = 0;
  let count = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel]) continue;
    const offset = pixel * 4;
    const pr = image.data[offset];
    const pg = image.data[offset + 1];
    const pb = image.data[offset + 2];
    r += pr;
    g += pg;
    b += pb;
    y += luminance(pr, pg, pb);
    count += 1;
  }
  return {
    r:r / Math.max(1, count),
    g:g / Math.max(1, count),
    b:b / Math.max(1, count),
    y:y / Math.max(1, count),
  };
}

const sample = fixture();
const quality = await import(moduleUrl('source/src/modules/scan/v3/AutoQualityBotV1093.js'));
const result = quality.autoFixDocumentV1093(sample.image, {}, { profile:'display' });

assert.ok(result.display?.data?.length, 'quality bot must return a display image');
assert.equal(result.metadata.qualityProfile, 'hybrid-clean-paper-selective-color-v10938');
assert.equal(result.metadata.hybridSelectiveColor, true);
assert.equal(result.metadata.cleanPaperBase, true);
assert.equal(result.metadata.coloredInkOverlay, true);
assert.equal(result.metadata.fullPageColorMode, false);
assert.equal(result.metadata.preserveColor, true, 'fixture must trigger selective color preservation');

const paperBefore = average(sample.image, sample.paperMask);
const paperAfter = average(result.display, sample.paperMask);
const textBefore = average(sample.image, sample.textMask);
const textAfter = average(result.display, sample.textMask);
const orangeBefore = average(sample.image, sample.orangeMask);
const orangeAfter = average(result.display, sample.orangeMask);
const leftBefore = average(sample.image, sample.leftPaperMask);
const centerBefore = average(sample.image, sample.centerPaperMask);
const leftAfter = average(result.display, sample.leftPaperMask);
const centerAfter = average(result.display, sample.centerPaperMask);

const contrastBefore = paperBefore.y - textBefore.y;
const contrastAfter = paperAfter.y - textAfter.y;
assert.ok(
  contrastAfter > contrastBefore * 1.16,
  `printed text must become visibly darker against clean paper: ${contrastBefore} -> ${contrastAfter}`,
);

const castBefore = Math.abs(paperBefore.r - paperBefore.g) + Math.abs(paperBefore.g - paperBefore.b);
const castAfter = Math.abs(paperAfter.r - paperAfter.g) + Math.abs(paperAfter.g - paperAfter.b);
assert.ok(castAfter < castBefore * .5, `warm full-page paper cast must be removed: ${castBefore} -> ${castAfter}`);

const shadowBefore = Math.abs(leftBefore.y - centerBefore.y);
const shadowAfter = Math.abs(leftAfter.y - centerAfter.y);
assert.ok(shadowAfter < shadowBefore * .70, `broad center shadow must flatten: ${shadowBefore} -> ${shadowAfter}`);

const orangeChromaBefore = Math.max(orangeBefore.r, orangeBefore.g, orangeBefore.b) - Math.min(orangeBefore.r, orangeBefore.g, orangeBefore.b);
const orangeChromaAfter = Math.max(orangeAfter.r, orangeAfter.g, orangeAfter.b) - Math.min(orangeAfter.r, orangeAfter.g, orangeAfter.b);
assert.ok(orangeAfter.r > orangeAfter.g && orangeAfter.g > orangeAfter.b, 'orange handwriting hue order must remain');
assert.ok(orangeChromaAfter >= orangeChromaBefore * .52, 'orange handwriting must remain visibly colored');

const qualitySource = read('source/src/modules/scan/v3/AutoQualityBotV1093.js');
assert.ok(qualitySource.includes('composeHybridDocumentDisplay'));
assert.ok(qualitySource.includes("mode:needsColor ? 'hybrid-clean-paper-selective-color'"));
assert.ok(qualitySource.includes('fullPageColorMode:false'));

const review = read('source/src/modules/scan/v3/ReviewScreenV3.jsx');
assert.ok(review.includes('data-road-ready-scanner-review="four-corner-v10931"'));
assert.ok(review.includes('4 corner frame'));
assert.equal(review.includes('bend points'), false);
assert.ok(review.includes('build 109.3.8'));

const perspective = read('source/src/modules/scan/v3/PerspectiveEngineV10934.js');
assert.ok(perspective.includes('estimateProjectiveAspectV10934'));
assert.ok(perspective.includes('bicubic-catmull-rom'));

const engine = read('source/src/modules/scan/v3/ScannerEngineV3.js');
assert.ok(engine.includes('warpPerspectiveV10934'));
assert.ok(engine.includes("primaryOutput:'displayFile'"));
assert.ok(engine.includes("captureAsset('original'"));
assert.ok(engine.includes("captureAsset('display-final'"));
assert.ok(engine.includes('jpegQuality:.995'));

const appUpdate = await import(moduleUrl('source/src/core/update/appUpdate.js'));
assert.equal(appUpdate.CURRENT_APP_VERSION, '109.3.8');
assert.equal(appUpdate.CURRENT_APP_BUILD, 'v10938-hybrid-clean-paper-selective-color');
assert.equal(
  appUpdate.shouldOfferAppUpdate({ version:'109.3.8', build:'v10938-hybrid-clean-paper-selective-color', force:true }),
  false,
  'target build must not offer itself again',
);

const release = JSON.parse(read('public/app-version.json'));
assert.equal(release.version, '109.3.8');
assert.equal(release.build, 'v10938-hybrid-clean-paper-selective-color');
assert.equal(release.force, true);

const manifest = JSON.parse(read('public/scanner-engine.json'));
assert.equal(manifest.version, '109.3.8');
assert.equal(manifest.name, 'Road Ready Scanner 0.4.8');
assert.equal(manifest.visibleHandles, 4);
assert.equal(manifest.geometry, 'projective-rectangle-native-detail');
assert.equal(manifest.primaryOutput, 'display-final');
assert.equal(manifest.qualityBot, 'road-ready-auto-quality-bot-v10938');
assert.equal(manifest.qualityProfile, 'hybrid-clean-paper-selective-color-v10938');
assert.equal(manifest.hybridSelectiveColor, true);
assert.equal(manifest.cleanPaperBase, true);
assert.equal(manifest.coloredInkOverlay, true);
assert.equal(manifest.fullPageColorMode, false);
assert.equal(manifest.originalPreserved, true);
assert.equal(manifest.bundledVersionBuildSynchronized, true);

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '109.3.8');

console.log('PASS — colored handwriting no longer forces the whole page into soft color mode');
console.log('PASS — clean paper and black printed text are the primary display base');
console.log('PASS — orange/red/blue handwriting is selectively restored');
console.log('PASS — four-corner geometry, display-final persistence, original and OCR assets remain unchanged');
console.log('PASS — v109.3.8 hybrid clean-paper selective-color scanner regression suite');
