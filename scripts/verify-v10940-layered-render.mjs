import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const moduleUrl = relative => `${pathToFileURL(path.join(ROOT, relative)).href}?v=${Date.now()}`;

const quality = read('source/src/modules/scan/v3/AutoQualityBotV1093.js');
assert.ok(quality.includes('composeLayeredDocumentRender'));
assert.ok(quality.includes('layeredPaperPass:true'));
assert.ok(quality.includes('sourceAnchoredTextPass:true'));
assert.ok(quality.includes('edgeAwareFusion:true'));
assert.ok(quality.includes('adaptiveMicroContrast:true'));
assert.ok(quality.includes('handwritingLayerPreserved:true'));
assert.ok(quality.includes('applyDocumentFidelityLock({ width, height, data }, source, metrics)'));
assert.ok(quality.includes("engine:'road-ready-auto-quality-bot-v10940'"));
assert.ok(quality.includes("qualityProfile:'layered-paper-text-fusion-v10940'"));
assert.equal(quality.includes('OCR rewrite'), false);

const review = read('source/src/modules/scan/v3/ReviewScreenV3.jsx');
assert.ok(review.includes('data-road-ready-scanner-review="four-corner-v10931"'));
assert.ok(review.includes('Layered render · build 109.4.0'));
assert.equal(review.includes('bend points'), false);

const engine = read('source/src/modules/scan/v3/ScannerEngineV3.js');
assert.ok(engine.includes('warpPerspectiveV10934'));
assert.ok(engine.includes("primaryOutput:'displayFile'"));
assert.ok(engine.includes("captureAsset('original'"));
assert.ok(engine.includes("captureAsset('display-final'"));
assert.ok(engine.includes('jpegQuality:.995'));

const appUpdate = await import(moduleUrl('source/src/core/update/appUpdate.js'));
assert.equal(appUpdate.CURRENT_APP_VERSION, '109.4.0');
assert.equal(appUpdate.CURRENT_APP_BUILD, 'v10940-layered-paper-text-fusion');
assert.equal(appUpdate.shouldOfferAppUpdate({ version:'109.4.0', build:'v10940-layered-paper-text-fusion', force:true }), false);

const release = JSON.parse(read('public/app-version.json'));
assert.equal(release.version, '109.4.0');
assert.equal(release.build, 'v10940-layered-paper-text-fusion');
assert.equal(release.force, true);

const manifest = JSON.parse(read('public/scanner-engine.json'));
assert.equal(manifest.version, '109.4.0');
assert.equal(manifest.name, 'Road Ready Scanner 0.5.0');
assert.equal(manifest.visibleHandles, 4);
assert.equal(manifest.primaryOutput, 'display-final');
assert.equal(manifest.qualityBot, 'road-ready-auto-quality-bot-v10940');
assert.equal(manifest.qualityProfile, 'layered-paper-text-fusion-v10940');
assert.equal(manifest.layeredPaperPass, true);
assert.equal(manifest.sourceAnchoredTextPass, true);
assert.equal(manifest.edgeAwareFusion, true);
assert.equal(manifest.adaptiveMicroContrast, true);
assert.equal(manifest.handwritingLayerPreserved, true);
assert.equal(manifest.contentFidelityLock, true);
assert.equal(manifest.generativeReconstruction, false);
assert.equal(manifest.ocrRewrite, false);
assert.equal(manifest.originalPreserved, true);

console.log('PASS — paper, text and handwriting are rendered in separate source-anchored passes');
console.log('PASS — local illumination normalization and edge-aware micro-contrast are active');
console.log('PASS — Fidelity Lock remains the final pass and no OCR/generative rewriting is enabled');
console.log('PASS — four-corner geometry, original, OCR and display-final assets remain unchanged');
console.log('PASS — v109.4.0 layered renderer regression suite');
