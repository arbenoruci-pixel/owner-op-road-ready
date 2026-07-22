import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const moduleUrl = relative => `${pathToFileURL(path.join(ROOT, relative)).href}?verify=${Date.now()}_${Math.random()}`;

function fixture() {
  const width = 720;
  const height = 960;
  const data = new Uint8ClampedArray(width * height * 4);
  const set = (x, y, r, g, b) => {
    const offset = (y * width + x) * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = 255;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const leftShadow = Math.max(0, 52 * (1 - x / (width * .65)));
      const bottomShadow = Math.max(0, 20 * ((y / height) - .55));
      const paper = Math.round(238 - leftShadow - bottomShadow);
      set(x, y, paper + 3, paper + 1, paper - 2);
    }
  }

  for (let row = 0; row < 24; row += 1) {
    const y0 = 95 + row * 28;
    const x0 = row % 2 ? 88 : 130;
    const x1 = width - 90 - (row % 5) * 24;
    for (let y = y0; y < y0 + 4; y += 1) {
      for (let x = x0; x < x1; x += 1) set(x, y, 54, 52, 50);
    }
  }

  for (let x = 180; x < 520; x += 1) {
    const y = 810 + Math.round(Math.sin(x / 23) * 5);
    for (let oy = -2; oy <= 2; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) set(x + ox, y + oy, 190, 74, 26);
    }
  }

  return { width, height, data };
}

function meanLuma(image, x0, y0, x1, y1) {
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * image.width + x) * 4;
      sum += image.data[offset] * .2126 + image.data[offset + 1] * .7152 + image.data[offset + 2] * .0722;
      count += 1;
    }
  }
  return sum / Math.max(1, count);
}

function meanChroma(image, x0, y0, x1, y1) {
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * image.width + x) * 4;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      sum += Math.max(r, g, b) - Math.min(r, g, b);
      count += 1;
    }
  }
  return sum / Math.max(1, count);
}

const quality = await import(moduleUrl('source/src/modules/scan/v3/AutoQualityBotV1093.js'));
const source = fixture();
const started = performance.now();
const result = quality.autoFixDocumentV1093(source, {}, { profile:'display' });
const elapsed = performance.now() - started;

assert.equal(result.display.width, source.width);
assert.equal(result.display.height, source.height);
assert.equal(result.metadata.qualityProfile, 'single-grid-single-pass-v10956');
assert.equal(result.metadata.fullResolutionPasses, 1);
assert.equal(result.metadata.fullResolutionMaskBuffers, 0);
assert.equal(result.metadata.repeatedIlluminationGrids, false);
assert.equal(result.metadata.layeredRender, false);
assert.equal(result.metadata.fidelityRepass, false);
assert.ok(elapsed < 1800, `display fixture should finish quickly, took ${elapsed.toFixed(1)}ms`);

const sourceShadowPaper = meanLuma(source, 30, 35, 150, 80);
const sourceClearPaper = meanLuma(source, 560, 35, 680, 80);
const outputShadowPaper = meanLuma(result.display, 30, 35, 150, 80);
const outputClearPaper = meanLuma(result.display, 560, 35, 680, 80);
assert.ok(
  Math.abs(outputClearPaper - outputShadowPaper) < Math.abs(sourceClearPaper - sourceShadowPaper) * .72,
  'one-pass renderer must visibly flatten the paper shadow',
);

const sourceText = meanLuma(source, 130, 95, 560, 99);
const outputText = meanLuma(result.display, 130, 95, 560, 99);
assert.ok(outputText < sourceText - 4, 'printed text must become visibly darker');

const sourceBlank = meanLuma(source, 260, 40, 460, 70);
const outputBlank = meanLuma(result.display, 260, 40, 460, 70);
assert.ok(outputBlank > 210, 'blank paper must remain bright');
assert.ok(Math.abs(outputBlank - sourceBlank) < 35, 'blank paper must not acquire a dark invented region');

const sourceOrange = meanChroma(source, 210, 800, 500, 825);
const outputOrange = meanChroma(result.display, 210, 800, 500, 825);
assert.ok(outputOrange > 20, 'orange handwriting must remain colored');
assert.ok(outputOrange >= sourceOrange * .55, 'colored handwriting must retain most of its source chroma');

const ocr = quality.autoFixDocumentV1093(source, {}, { profile:'ocr' });
assert.ok(ocr.clean?.data?.length, 'OCR clean image must exist');
assert.ok(ocr.highContrast?.data?.length, 'OCR high-contrast image must exist');
assert.equal(ocr.metadata.fullResolutionMaskBuffers, 0);

const sourceCode = read('source/src/modules/scan/v3/AutoQualityBotV1093.js');
assert.equal(sourceCode.includes('composeLayeredDocumentRender'), false);
assert.equal(sourceCode.includes('composeHybridDocumentDisplay'), false);
assert.equal(sourceCode.includes('applyDocumentFidelityLock'), false);
assert.equal(sourceCode.includes('new Float32Array(pixelCount)'), false);
assert.ok(sourceCode.includes('renderDocumentSinglePass'));
assert.ok(sourceCode.includes('analysisSampleCap:180000'));

const engine = read('source/src/modules/scan/v3/ScannerEngineV3.js');
assert.ok(engine.includes('maxOutputDimension || 3000'));
assert.ok(engine.includes('maxOcrDimension || 1800'));
assert.ok(engine.includes('Cleaning paper and sharpening text in one fast pass'));
assert.ok(engine.includes("captureAsset('original'"));
assert.ok(engine.includes("captureAsset('display-final'"));
assert.ok(engine.includes("captureAsset('ocr-selected'"));

const manifest = JSON.parse(read('public/scanner-engine.json'));
assert.equal(manifest.version, '109.5.6');
assert.equal(manifest.name, 'Road Ready Scanner 0.6.0');
assert.equal(manifest.displayFullResolutionPasses, 1);
assert.equal(manifest.repeatedIlluminationGrids, false);
assert.equal(manifest.fullResolutionMaskBuffers, 0);
assert.equal(manifest.primaryOutput, 'display-final');
assert.equal(manifest.originalPreserved, true);

console.log(`PASS — v109.5.6 single-pass display fixture completed in ${elapsed.toFixed(1)}ms`);
console.log('PASS — paper shadows flatten and printed text gains visible contrast');
console.log('PASS — blank paper stays source-safe and colored handwriting remains colored');
console.log('PASS — layered masks, repeated grids and repeated Fidelity Lock passes are removed');
console.log('PASS — original, display-final and OCR assets remain in the scanner contract');
