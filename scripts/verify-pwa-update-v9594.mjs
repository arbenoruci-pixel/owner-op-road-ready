import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  CURRENT_APP_VERSION,
  clearBrowserCaches,
  compareVersions,
  isNewerVersion,
  normalizeRemoteVersionPayload,
  versionedServiceWorkerUrl,
} from '../source/src/core/update/appUpdate.js';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};
const equal = (actual, expected, message) => {
  assert.equal(actual, expected, message);
  checks += 1;
};

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const remote = JSON.parse(read('public/app-version.json'));
const appUpdate = read('source/src/core/update/appUpdate.js');
const app = read('source/src/app/App.jsx');
const sw = read('public/sw.js');
const syncClient = read('lib/sync/clientSync.js');
const syncScript = read('scripts/sync-release-version.mjs');
const nextConfig = read('next.config.mjs');
const page = read('app/page.jsx');

// Exact equality across every release surface is the regression guard for the v95.93 update loop.
ok(/^\d+\.\d+\.\d+$/.test(pkg.version), 'package uses numeric semver');
equal(lock.version, pkg.version, 'package-lock root version matches package');
equal(lock.packages[''].version, pkg.version, 'package-lock app entry matches package');
equal(remote.version, pkg.version, 'app-version.json matches package exactly');
equal(CURRENT_APP_VERSION, pkg.version, 'compiled app version matches package exactly');
ok(appUpdate.includes(`const FALLBACK_APP_VERSION = '${pkg.version}'`), 'runtime fallback version is synchronized');
ok(sw.includes(`const OWNER_OP_SW_VERSION = '${pkg.version}'`), 'service-worker version is synchronized');

ok(compareVersions('96.1.0', '96.0.0') > 0, 'version compare detects the new release');
ok(isNewerVersion('96.2.0', pkg.version), 'newer remote release is detected');
ok(!isNewerVersion(pkg.version, pkg.version), 'same release does not loop');
equal(normalizeRemoteVersionPayload({ appVersion:pkg.version, buildId:'build-x' }).build, 'build-x', 'remote build metadata normalizes');
ok(versionedServiceWorkerUrl(pkg.version).includes(`owner_op_v=${pkg.version}`), 'worker URL is release-versioned');

const deleted = [];
const previousCaches = globalThis.caches;
globalThis.caches = {
  async keys() { return ['old-shell', 'old-runtime']; },
  async delete(key) { deleted.push(key); return true; },
};
await clearBrowserCaches();
globalThis.caches = previousCaches;
equal(deleted.length, 2, 'page update clears stale Cache Storage');

ok(app.includes('requestServiceWorkerUpdate(remote, meta)'), 'Update safely requests the exact new worker');
ok(app.includes('saveAppSnapshot(APP_STATE_KEY, state)'), 'normal local snapshot is saved first');
ok(app.includes('savePreUpdateSnapshot(state, meta)'), 'pre-update backup is saved first');
ok(app.includes('window.location.replace(target)'), 'update uses cache-busted replacement navigation');
ok(app.includes('workerResult.activated'), 'reload timing responds to worker activation');

ok(appUpdate.includes("updateViaCache: 'none'"), 'update worker registration bypasses HTTP cache');
ok(appUpdate.includes('waitForServiceWorkerVersion'), 'update waits for the requested worker revision');
ok(appUpdate.includes("registration.addEventListener?.('updatefound'"), 'worker install is observed');
ok(appUpdate.includes("navigator.serviceWorker.addEventListener('controllerchange'"), 'controller takeover is observed');
ok(!appUpdate.includes('indexedDB.deleteDatabase'), 'update helper never deletes IndexedDB');
ok(!sw.includes('indexedDB.deleteDatabase'), 'service worker never deletes IndexedDB');

ok(sw.includes("self.addEventListener('install'"), 'worker handles install');
ok(sw.includes('await clearAllCaches();'), 'worker clears Cache Storage');
ok(sw.includes('await self.skipWaiting();'), 'worker skips waiting');
ok(sw.includes('await self.clients.claim();'), 'worker claims the PWA window');

ok(syncClient.includes('versionedServiceWorkerUrl(CURRENT_APP_VERSION'), 'normal startup registers the current worker revision');
ok(syncClient.includes("updateViaCache: 'none'"), 'startup worker check bypasses HTTP cache');
ok(syncClient.includes("navigator.serviceWorker?.addEventListener?.('message'"), 'worker messages use the correct browser event target');

ok(syncScript.includes('FALLBACK_APP_VERSION'), 'prebuild synchronizer updates app runtime version');
ok(syncScript.includes('OWNER_OP_SW_VERSION'), 'prebuild synchronizer updates worker version');
ok(syncScript.includes("public/app-version.json"), 'prebuild synchronizer updates remote release metadata');
ok(pkg.scripts.prebuild === 'npm run sync:version', 'version sync runs before every build');
ok(pkg.scripts['check:version'], 'version consistency check is available');

ok(nextConfig.includes("source: '/'"), 'root document has no-cache headers');
ok(nextConfig.includes("source: '/app-version.json'"), 'remote version file has no-cache headers');
ok(nextConfig.includes("source: '/manifest.webmanifest'"), 'PWA manifest has no-cache headers');
ok(nextConfig.includes("source: '/sw.js'"), 'worker script has no-cache headers');
ok(nextConfig.includes('X-Owner-Op-App-Version'), 'root response exposes a diagnostic app version');
ok(page.includes("dynamic = 'force-dynamic'"), 'root HTML is network-rendered instead of reused as a stale static document');
ok(page.includes('revalidate = 0'), 'root HTML does not retain a revalidation cache');

console.log(`verify-pwa-update-v9594: ${checks} checks PASS`);
