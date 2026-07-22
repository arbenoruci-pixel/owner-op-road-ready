import assert from 'node:assert/strict';
import fs from 'node:fs';

const version = JSON.parse(fs.readFileSync('public/app-version.json', 'utf8'));
const recovery = fs.readFileSync('public/force-update-10960.html', 'utf8');
const genericRecovery = fs.readFileSync('public/force-update.html', 'utf8');
const updateBoot = fs.readFileSync('public/update.html', 'utf8');
const appUpdate = fs.readFileSync('source/src/core/update/appUpdate.js', 'utf8');
const sw = fs.readFileSync('public/sw.js', 'utf8');
const rateEngine = fs.readFileSync('source/src/modules/scan/engines/rateConfirmationEngineV1.js', 'utf8');
const podEngine = fs.readFileSync('source/src/modules/scan/engines/podEngineV1.js', 'utf8');
const bolEngine = fs.readFileSync('source/src/modules/scan/engines/bolEngineV1.js', 'utf8');
const fuelEngine = fs.readFileSync('source/src/modules/scan/engines/fuelReceiptEngineV1.js', 'utf8');

assert.equal(version.version, '109.6.0');
assert.equal(version.build, 'v10960-iphone-force-update-recovery');
assert.equal(version.force, true);
assert.equal(version.recoveryUrl, '/force-update-10960.html');

for (const html of [recovery, genericRecovery]) {
  assert.ok(html.includes("navigator.serviceWorker.getRegistrations()"), 'recovery must enumerate stale service workers');
  assert.ok(html.includes('registration.unregister()'), 'recovery must unregister stale service workers');
  assert.ok(html.includes('caches.delete'), 'recovery must clear browser code caches');
  assert.ok(html.includes("fetch('/app-version.json?force='"), 'recovery must read current production release without cache');
  assert.ok(html.includes("target.searchParams.set('fresh'"), 'recovery must reopen with a cache-busting URL');
  assert.ok(html.includes('Your Logbook, documents and saved app data are kept.'), 'recovery must state data preservation');
  assert.equal(html.includes('indexedDB.deleteDatabase'), false, 'recovery must not delete app databases');
  assert.equal(html.includes('localStorage.clear()'), false, 'recovery must not clear all local app data');
}

assert.ok(updateBoot.includes("const version = params.get('version') || '109.6.0';"));
assert.ok(updateBoot.includes("const build = params.get('build') || 'v10960-iphone-force-update-recovery';"));
assert.ok(appUpdate.includes("const FALLBACK_APP_VERSION = '109.6.0';"));
assert.ok(appUpdate.includes("const FALLBACK_APP_BUILD = 'v10960-iphone-force-update-recovery';"));
assert.ok(sw.includes("const OWNER_OP_SW_VERSION = '109.6.0';"));
assert.ok(sw.includes("const OWNER_OP_SW_BUILD = 'v10960-iphone-force-update-recovery';"));

for (const source of [rateEngine, podEngine, bolEngine, fuelEngine]) {
  assert.ok(source.includes("version:'1.0.0'"), 'isolated document engines must remain pinned at 1.0.0');
  assert.ok(source.includes('locked:true'), 'isolated document engines must remain locked');
}

console.log('PASS — v109.6.0 recovery clears stale iPhone app code while preserving all Road Ready data');
