import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const moduleUrl = relative => `${pathToFileURL(path.join(ROOT, relative)).href}?verify=${Date.now()}_${Math.random()}`;

const update = await import(moduleUrl('source/src/core/update/appUpdate.js'));
assert.equal(update.CURRENT_APP_VERSION, '109.3.4');
assert.equal(update.CURRENT_APP_BUILD, 'v10934-forced-update-bootstrap');
assert.equal(update.shouldOfferAppUpdate({ version:'109.3.4', build:'v10934-forced-update-bootstrap' }), false);
assert.equal(update.shouldOfferAppUpdate({ version:'109.3.4', build:'stale-build' }), true);
assert.equal(update.shouldOfferAppUpdate({ version:'109.3.5', build:'next-build' }), true);
assert.equal(update.shouldOfferAppUpdate({ version:'109.3.3', build:'old-build' }), false);
assert.equal(update.normalizeRemoteVersionPayload({ version:'109.3.4', force:true }).force, true);
assert.ok(update.versionedServiceWorkerUrl('109.3.4', 'build-x').includes('owner_op_build=build-x'));

const app = read('source/src/app/App.jsx');
assert.ok(app.includes('CURRENT_APP_BUILD'));
assert.ok(app.includes('shouldOfferAppUpdate(remote)'));
assert.ok(app.includes("window.addEventListener('pageshow', onPageShow)"));
assert.ok(app.includes("window.addEventListener('focus', onFocus)"));
assert.ok(app.includes('prev.remote?.force === true'));
assert.equal(app.includes('isNewerVersion(remote.version'), false);

const banner = read('source/src/modules/update/UpdateBanner.jsx');
assert.ok(banner.includes('data-owner-op-update-banner="109.3.4"'));
assert.ok(banner.includes('zIndex:2147483000'));
assert.ok(banner.includes("forced ? 'Required app refresh'"));
assert.ok(banner.includes('!busy && !forced'));

const tools = read('source/src/shared/ui/ToolsSheet.jsx');
assert.ok(tools.includes('Force reload latest build'));
assert.ok(tools.includes('data-force-latest-build="109.3.4"'));
assert.ok(tools.includes('Reload clean'));

const apiRoute = read('source/src/app/api/app-version/route.js');
assert.ok(apiRoute.includes("version:'109.3.4'"));
assert.ok(apiRoute.includes("build:'v10934-forced-update-bootstrap'"));
assert.ok(apiRoute.includes('force:true'));
assert.ok(apiRoute.includes("'Cache-Control':'no-store"));
assert.ok(apiRoute.includes("'CDN-Cache-Control':'no-store'"));

const boot = read('public/update.html');
assert.ok(boot.includes('navigator.serviceWorker.getRegistrations'));
assert.ok(boot.includes('registration.unregister()'));
assert.ok(boot.includes('caches.delete'));
assert.ok(boot.includes("location.replace(destination())"));
assert.ok(boot.includes("road_ready_build"));

const worker = read('public/sw.js');
assert.ok(worker.includes("OWNER_OP_SW_VERSION = '109.3.4'"));
assert.ok(worker.includes("OWNER_OP_SW_BUILD = 'v10934-forced-update-bootstrap'"));
assert.ok(worker.includes('OWNER_OP_RELEASE_CONTROL'));
assert.ok(worker.includes('self.registration.unregister()'));

const review = read('source/src/modules/scan/v3/ReviewScreenV3.jsx');
assert.ok(review.includes('4 corner frame · build 109.3.4'));
const scannerUi = read('source/src/modules/scan/v3/RoadReadyScannerV3.jsx');
assert.ok(scannerUi.includes('Road Ready Scanner 0.4.4 · App 109.3.4'));

const manifest = JSON.parse(read('public/app-version.json'));
assert.equal(manifest.version, '109.3.4');
assert.equal(manifest.build, 'v10934-forced-update-bootstrap');
assert.equal(manifest.force, true);
const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
assert.equal(scannerManifest.version, '109.3.4');
assert.equal(scannerManifest.updateBootstrap, 'cache-reset-v10934');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '109.3.4');
assert.equal(pkg.engines.node, '24.x');

console.log('PASS — dynamic no-store version endpoint is installed');
console.log('PASS — version and build mismatch both trigger the update banner');
console.log('PASS — forced update cannot be dismissed and renders over scanner/viewer screens');
console.log('PASS — update bootstrap unregisters service workers and clears Cache Storage');
console.log('PASS — Tools includes a manual clean-reload escape hatch');
console.log('PASS — scanner review visibly identifies build 109.3.4');
console.log('PASS — v109.3.4 forced update bootstrap regression suite');
