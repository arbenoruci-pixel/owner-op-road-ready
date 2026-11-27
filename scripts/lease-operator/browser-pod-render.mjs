import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Run from a materialized release. Serve just the scanner modules needed by the
// comparison so both paths use the same browser, image codec and generated engine.
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = createServer(async (req, res) => {
  if (req.url === '/') return res.writeHead(200, {'Content-Type':'text/html'}).end('<!doctype html><title>POD scan test</title>');
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + pathname);
  if (!file.startsWith(resolve(root) + sep) || !/^\/(?:source\/src\/|app\/operator\/podPage)/.test(pathname) || !file.endsWith('.js')) {
    return res.writeHead(404).end();
  }
  try {
    const source = await readFile(file);
    res.writeHead(200, {'Content-Type':'text/javascript'}).end(source);
  } catch { res.writeHead(404).end(); }
});
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({headless:true, executablePath:process.env.TEST_CHROMIUM_PATH || undefined});
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + server.address().port);
  const results = await page.evaluate(async () => {
    const {processDocumentClient} = await import('/source/src/modules/scan/v3/processDocumentClientV110330.js');
    const {scannerEngineV3} = await import('/source/src/modules/scan/v3/ScannerEngineV3.js');
    const {processPodPage, preparePodCrop, finalizePodCrop} = await import('/app/operator/podPageClient.js');
    const hash = async file => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))).join(',');
    const canvas = document.createElement('canvas');
    canvas.width = 2000; canvas.height = 2500;
    const g = canvas.getContext('2d');
    g.fillStyle = '#314457'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#f8f6ef'; g.fillRect(180, 150, 1640, 2180);
    g.fillStyle = '#203349'; g.font = 'bold 44px sans-serif'; g.fillText('SYNTHETIC POD', 250, 270);
    g.font = '29px sans-serif';
    for (let n = 0; n < 24; n++) g.fillText('Delivery line ' + (n + 1) + '   48236   carton count        driver review', 260, 390 + n * 64);
    g.lineWidth = 6; g.strokeStyle = '#1a5ca6';
    g.beginPath(); g.moveTo(280, 2190); g.bezierCurveTo(430, 1900, 350, 2280, 610, 2130); g.stroke();
    const file = new File([await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .95))], 'training.jpg', {type:'image/jpeg'});
    const originalHash = await hash(file);
    const times = {generic:[], pod:[]};
    let old, fresh;
    for (let run = 0; run < 3; run++) {
      for (const which of (run % 2 ? ['pod','generic'] : ['generic','pod'])) {
        const fn = which === 'generic' ? processDocumentClient : processPodPage;
        const started = performance.now(), result = await fn(file, 'photo-intake', null);
        times[which].push(Math.round(performance.now() - started));
        if (which === 'generic') old = result; else fresh = result;
      }
    }
    const dimensions = x => [x.metadata.captureManifest.perspective.width, x.metadata.captureManifest.perspective.height];
    let tick = performance.now();
    const legacyCrop = await scannerEngineV3.prepare(file, {source:'page-review'});
    const legacyRotated = await scannerEngineV3.rotate(legacyCrop);
    const genericOpenMs = Math.round(performance.now() - tick);
    tick = performance.now();
    const session = await preparePodCrop(file, 90, fresh.corners, null);
    const podOpenMs = Math.round(performance.now() - tick);
    const sameEditorPixels = await hash(session.reviewFile) === await hash(legacyRotated.reviewFile);
    // A different, explicitly confirmed user crop on an already rotated original.
    const manual = [{x:.1,y:.12},{x:.88,y:.1},{x:.9,y:.9},{x:.12,y:.87}];
    const before = await scannerEngineV3.finalize(session, manual, {preserveOrientation:true});
    const after = await finalizePodCrop(session, manual);
    const uncertain = await processPodPage(file, 'camera', {version:1, file:{name:'different.jpg'}});
    return {
      sameEditorPixels, cropOpenMs:{generic:genericOpenMs,pod:podOpenMs},
      sameCorners:JSON.stringify(fresh.corners) === JSON.stringify(old.corners),
      samePixels:await hash(fresh.result.displayFile) === await hash(old.result.displayFile),
      dimensions:dimensions(fresh.result), sameSize:JSON.stringify(dimensions(fresh.result)) === JSON.stringify(dimensions(old.result)),
      manualMatches:await hash(before.displayFile) === await hash(after.displayFile),
      safeFallback:uncertain.result.metadata.captureManifest.boundary.needsReview && uncertain.corners.every(p => [0,1].includes(p.x) && [0,1].includes(p.y)),
      untouched:originalHash === await hash(file), extraOcr:Object.hasOwn(fresh.result,'ocrFile'),
      oldSecondaries:old.result.metadata.captureAssets[1].file.size + old.result.ocrFile.size,
      colorJpegBytes:fresh.result.displayFile.size, times,
    };
  });
  for (const key of ['sameEditorPixels','sameCorners','samePixels','sameSize','manualMatches','safeFallback','untouched']) assert.equal(results[key], true, key);
  assert.equal(results.extraOcr, false);
  console.log(JSON.stringify(results));
} finally {
  await browser?.close();
  server.close();
}
