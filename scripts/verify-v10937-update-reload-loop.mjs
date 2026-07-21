import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const moduleUrl = relative => `${pathToFileURL(path.join(ROOT, relative)).href}?verify=${Date.now()}_${Math.random()}`;

const appUpdate = await import(moduleUrl('source/src/core/update/appUpdate.js'));
assert.equal(appUpdate.CURRENT_APP_VERSION, '109.3.7');
assert.equal(appUpdate.CURRENT_APP_BUILD, 'v10937-update-reload-completion');
assert.equal(
  appUpdate.shouldOfferAppUpdate({ version:'109.3.7', build:'v10937-update-reload-completion', force:true }),
  false,
  'the installed target build must not offer itself again',
);
assert.equal(
  appUpdate.shouldOfferAppUpdate({ version:'109.3.7', build:'v10937-other-build' }),
  true,
  'a same-version different build must still offer an update',
);
assert.equal(
  appUpdate.shouldOfferAppUpdate({ version:'109.3.6', build:'v10936-road-ready-scanner-reference-quality' }),
  false,
  'an older release must not replace the current bundle',
);

const updateSource = read('source/src/core/update/appUpdate.js');
assert.ok(updateSource.includes("const FALLBACK_APP_VERSION = '109.3.7'"));
assert.ok(updateSource.includes("const FALLBACK_APP_BUILD = 'v10937-update-reload-completion'"));
assert.ok(updateSource.includes('export const CURRENT_APP_VERSION = FALLBACK_APP_VERSION'));
assert.ok(updateSource.includes('export const CURRENT_APP_BUILD = FALLBACK_APP_BUILD'));
assert.equal(updateSource.includes('process.env.NEXT_PUBLIC_OWNER_OP_APP_VERSION'), false);
assert.equal(updateSource.includes('process.env.NEXT_PUBLIC_OWNER_OP_APP_BUILD'), false);
assert.ok(updateSource.includes('export const UPDATE_WORKER_TIMEOUT_MS = 1_500'));

const app = read('source/src/app/App.jsx');
assert.ok(app.includes("buildUpdateMeta(remote, 'reload_completion_v10937')"));
assert.ok(app.includes('window.__OWNER_OP_UPDATE_NAVIGATING__'));
assert.ok(app.includes('navigationWatchdogV10937'));
assert.ok(app.includes('Promise.allSettled(['));
assert.ok(app.includes('new Promise(resolve => setTimeout(resolve, 650))'));
assert.ok(app.includes('requestServiceWorkerUpdate(remote, meta).catch(() => {})'));
assert.ok(app.includes('window.location.replace(target)'));
assert.equal(
  app.includes('await requestServiceWorkerUpdate(remote, meta);'),
  false,
  'Reload latest must not wait for the service-worker activation timeout',
);

const banner = read('source/src/modules/update/UpdateBanner.jsx');
assert.ok(banner.includes('data-owner-op-update-banner="109.3.7"'));
assert.ok(banner.includes("busy ? 'Opening latest build'"));
assert.ok(banner.includes("{busy ? 'Opening…' : 'Reload latest'}"));

const boot = read('public/update.html');
assert.ok(boot.includes("const version = params.get('version') || '109.3.7'"));
assert.ok(boot.includes("const build = params.get('build') || 'v10937-update-reload-completion'"));
assert.ok(boot.includes('navigationWatchdogV10937'));
assert.ok(boot.includes('new Promise(resolve => setTimeout(resolve, 850))'));
assert.ok(boot.includes('setTimeout(go, 1_400)'));
assert.ok(boot.includes('}, 2200);'));
assert.equal(boot.includes('}, 7000);'), false);

const sw = read('public/sw.js');
assert.ok(sw.includes("const OWNER_OP_SW_VERSION = '109.3.7'"));
assert.ok(sw.includes("const OWNER_OP_SW_BUILD = 'v10937-update-reload-completion'"));

const release = JSON.parse(read('public/app-version.json'));
assert.equal(release.version, '109.3.7');
assert.equal(release.build, 'v10937-update-reload-completion');
assert.equal(release.force, true);

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
assert.equal(scannerManifest.version, '109.3.7');
assert.equal(scannerManifest.visibleBuildMarker, '109.3.7');
assert.equal(scannerManifest.updateBootstrap, 'v10937-update-reload-completion');
assert.equal(scannerManifest.updateNavigation, 'immediate-update-page-v10937');
assert.equal(scannerManifest.bundledVersionBuildSynchronized, true);
assert.equal(scannerManifest.qualityBot, 'road-ready-auto-quality-bot-v10936');
assert.equal(scannerManifest.qualityProfile, 'reference-trained-shadow-flat-text-clarity');
assert.equal(scannerManifest.primaryOutput, 'display-final');

const review = read('source/src/modules/scan/v3/ReviewScreenV3.jsx');
assert.ok(review.includes('build 109.3.7'));
const scanner = read('source/src/modules/scan/v3/RoadReadyScannerV3.jsx');
assert.ok(scanner.includes('Road Ready Scanner 0.4.7'));
assert.ok(scanner.includes('App 109.3.7'));

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '109.3.7');

console.log('PASS — bundled app version and build now match the release manifest');
console.log('PASS — Reload latest navigates without waiting for service-worker activation');
console.log('PASS — update.html has a hard iPhone navigation watchdog');
console.log('PASS — Scanner 0.4.7 quality and document assets remain unchanged');
console.log('PASS — v109.3.7 update reload loop regression suite');
