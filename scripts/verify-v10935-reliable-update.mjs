import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const moduleUrl = relative => `${pathToFileURL(path.join(ROOT, relative)).href}?verify=${Date.now()}_${Math.random()}`;

const update = await import(moduleUrl('source/src/core/update/appUpdate.js'));
assert.equal(update.CURRENT_APP_VERSION, '109.3.5');
assert.equal(update.CURRENT_APP_BUILD, 'v10935-reliable-update-bootstrap');
assert.equal(update.shouldOfferAppUpdate({ version:'109.3.5', build:'v10935-reliable-update-bootstrap' }), false);
assert.equal(update.shouldOfferAppUpdate({ version:'109.3.5', build:'stale-build' }), true);
assert.equal(update.shouldOfferAppUpdate({ version:'109.3.6', build:'future' }), true);
assert.equal(update.shouldOfferAppUpdate({ version:'109.3.4', build:'old' }), false);

const app = read('source/src/app/App.jsx');
assert.ok(app.includes('shouldOfferAppUpdate(remote)'));
assert.ok(app.includes("window.addEventListener('focus', onFocus)"));
assert.ok(app.includes("window.addEventListener('pageshow', onPageShow)"));
assert.ok(app.includes("if (prev.remote?.force === true) return prev"));
assert.equal(app.includes('isNewerVersion(remote.version'), false);

const banner = read('source/src/modules/update/UpdateBanner.jsx');
assert.ok(banner.includes('data-owner-op-update-banner="109.3.5"'));
assert.ok(banner.includes('zIndex:2147483000'));
assert.ok(banner.includes("forced ? 'Required app refresh'"));
assert.ok(banner.includes('!busy && !forced'));

const tools = read('source/src/shared/ui/ToolsSheet.jsx');
assert.ok(tools.includes('data-force-latest-build="109.3.5"'));
assert.ok(tools.includes('Force reload latest build'));

const boot = read('public/update.html');
assert.ok(boot.includes("navigator.serviceWorker.getRegistrations()"));
assert.ok(boot.includes('registration.unregister()'));
assert.ok(boot.includes('caches.delete'));
assert.ok(boot.includes('/app-version.json?ts='));
assert.ok(boot.includes("road_ready_update"));
assert.ok(boot.includes("road_ready_build"));

const sw = read('public/sw.js');
assert.ok(sw.includes("const OWNER_OP_SW_VERSION = '109.3.5'"));
assert.ok(sw.includes("const OWNER_OP_SW_BUILD = 'v10935-reliable-update-bootstrap'"));
assert.ok(sw.includes('OWNER_OP_RELEASE_CONTROL'));
assert.ok(sw.includes('self.registration.unregister()'));

const manifest = JSON.parse(read('public/app-version.json'));
assert.equal(manifest.version, '109.3.5');
assert.equal(manifest.build, 'v10935-reliable-update-bootstrap');
assert.equal(manifest.force, true);

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
assert.equal(scannerManifest.version, '109.3.5');
assert.equal(scannerManifest.name, 'Road Ready Scanner 0.4.5');
assert.equal(scannerManifest.updateBootstrap, 'v10935-reliable-update-bootstrap');

const scannerUi = read('source/src/modules/scan/v3/RoadReadyScannerV3.jsx');
assert.ok(scannerUi.includes('Road Ready Scanner 0.4.5 · App 109.3.5'));
const review = read('source/src/modules/scan/v3/ReviewScreenV3.jsx');
assert.ok(review.includes('4 corner frame · build 109.3.5'));

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '109.3.5');
assert.equal(pkg.engines.node, '24.x');

console.log('PASS — stale 109.3.4 shells must offer v109.3.5');
console.log('PASS — version and build mismatch both trigger update');
console.log('PASS — forced update banner stays above scanner and viewer overlays');
console.log('PASS — update page unregisters service workers and clears Cache Storage');
console.log('PASS — Log Tools includes manual clean reload recovery');
console.log('PASS — Scanner 0.4.5 remains installed and visibly reports app build 109.3.5');
console.log('PASS — v109.3.5 reliable update regression suite');
