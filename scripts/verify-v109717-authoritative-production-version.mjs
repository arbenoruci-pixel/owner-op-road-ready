import fs from 'node:fs';
import assert from 'node:assert/strict';

const VERSION = '109.7.17';
const BUILD = 'v109717-authoritative-production-version';
const read = path => fs.readFileSync(path, 'utf8');

const release = JSON.parse(read('release-version.json'));
const manifest = JSON.parse(read('public/app-version.json'));
const proof = JSON.parse(read('public/release-proof.json'));
const pkg = JSON.parse(read('package.json'));
const lock = fs.existsSync('package-lock.json') ? JSON.parse(read('package-lock.json')) : null;
const update = read('source/src/core/update/appUpdate.js');
const home = read('source/src/modules/home/HomeScreen.jsx');
const tools = read('source/src/shared/ui/ToolsSheet.jsx');
const sw = read('public/sw.js');
const config = read('next.config.mjs');
const updatePage = read('public/update.html');

assert.equal(release.version, VERSION);
assert.equal(release.build, BUILD);
assert.equal(manifest.version, VERSION);
assert.equal(manifest.build, BUILD);
assert.equal(proof.version, VERSION);
assert.equal(proof.build, BUILD);
assert.equal(pkg.version, VERSION);
assert.equal(pkg.engines?.node, '24.x');
if (lock) {
  assert.equal(lock.version, VERSION);
  assert.equal(lock.packages?.['']?.version, VERSION);
}
assert.ok(update.includes(`const FALLBACK_APP_VERSION = '${VERSION}';`));
assert.ok(update.includes(`const FALLBACK_APP_BUILD = '${BUILD}';`));
assert.ok(update.includes('export const CURRENT_APP_VERSION = FALLBACK_APP_VERSION;'));
assert.ok(!update.includes('process.env.NEXT_PUBLIC_OWNER_OP_APP_VERSION'));
assert.ok(home.includes(`App v${VERSION}`), 'Home must contain the final visible app version');
assert.ok(!home.includes('App v{CURRENT_APP_VERSION}'));
assert.ok(tools.includes(`v${VERSION}`), 'Log Tools must contain the final visible app version');
assert.ok(sw.includes(`const OWNER_OP_SW_VERSION = '${VERSION}';`));
assert.ok(sw.includes(`const OWNER_OP_SW_BUILD = '${BUILD}';`));
assert.ok(config.includes("./release-version.json"));
assert.ok(config.includes("generateBuildId"));
assert.ok(config.includes("X-Owner-Op-App-Version"));
assert.ok(config.includes("NEXT_PUBLIC_OWNER_OP_APP_VERSION: appVersion"));
assert.ok(!config.includes('packageJson.version'));
assert.ok(updatePage.includes('getRegistrations'));
assert.ok(updatePage.includes('caches.keys'));
assert.ok(updatePage.includes('location.replace'));

console.log('PASS — all source, visible, header, service-worker and manifest versions are synchronized at v109.7.17');
