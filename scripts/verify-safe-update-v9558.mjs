import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  CURRENT_APP_VERSION,
  compareVersions,
  isNewerVersion,
  normalizeRemoteVersionPayload,
  updateReloadUrl,
} from '../source/src/core/update/appUpdate.js';

const root = path.resolve(process.cwd());
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

ok(CURRENT_APP_VERSION === '95.60.0', 'current update version is v95.60.0');
ok(compareVersions('95.60.1', '95.60.0') > 0, 'version compare detects patch increase');
ok(compareVersions('95.60.0', '95.59.9') > 0, 'version compare detects minor increase');
ok(compareVersions('95.60.0', '95.60.0') === 0, 'version compare equal');
ok(isNewerVersion('95.60.1', '95.60.0'), 'isNewerVersion true for remote newer');
ok(!isNewerVersion('95.57.0', '95.60.0'), 'isNewerVersion false for remote older');
ok(normalizeRemoteVersionPayload({ version:'95.60.0', notes:['a'] }).version === '95.60.0', 'remote payload normalizes');

const versionJson = JSON.parse(read('public/app-version.json'));
ok(versionJson.version === '95.60.0', 'public app-version matches patch');
ok(Array.isArray(versionJson.notes), 'public app-version has notes');

const app = read('source/src/app/App.jsx');
ok(app.includes('fetchRemoteAppVersion'), 'App imports update fetcher');
ok(app.includes('UPDATE_CHECK_INTERVAL_MS'), 'App schedules update checks');
ok(app.includes('savePreUpdateSnapshot'), 'App saves pre-update snapshot');
ok(app.includes('saveAppSnapshot(APP_STATE_KEY, state)'), 'App saves current state before update');
ok(app.includes('OWNER_OP_APPLY_UPDATE'), 'App notifies service worker to apply update');
ok(app.includes('UpdateBanner'), 'App renders update banner');
ok(app.includes('visibilitychange'), 'App checks update when visible again');
ok(app.includes("window.addEventListener('online'"), 'App checks update when online');
ok(!app.includes('window.location.reload()'), 'App does not blind reload without cache-busting URL');
ok(app.includes('updateReloadUrl(remote)'), 'App uses cache-busting update reload URL');

const appState = read('lib/local-db/appState.js');
ok(appState.includes('PRE_UPDATE_STATE_KEY'), 'pre-update snapshot key exists');
ok(appState.includes('savePreUpdateSnapshot'), 'savePreUpdateSnapshot helper exists');
ok(appState.includes('window.localStorage.setItem(PRE_UPDATE_STATE_KEY'), 'localStorage fallback snapshot exists');
ok(appState.includes('last_pre_update_backup_at'), 'pre-update timestamp is stored');

const sw = read('public/sw.js');
ok(sw.includes("OWNER_OP_SW_VERSION = '95.60.0'"), 'service worker version updated');
ok(sw.includes('OWNER_OP_APPLY_UPDATE'), 'service worker handles apply update');
ok(sw.includes('clearAllCaches'), 'service worker can clear caches');
ok(sw.includes('skipWaiting'), 'service worker skipWaiting enabled');
ok(sw.includes('clients.claim'), 'service worker claims clients');

const next = read('next.config.mjs');
ok(next.includes('/app-version.json'), 'next headers include app-version');
ok(next.includes('no-store, no-cache'), 'app-version is no-cache');
ok(next.includes('/sw.js'), 'next headers include sw.js');

const tools = read('source/src/shared/ui/ToolsSheet.jsx');
ok(tools.includes('Check app update'), 'Tools has manual update card');
ok(tools.includes('Update safely'), 'Tools exposes safe update action');
ok(tools.includes('CURRENT_APP_VERSION'), 'Tools displays current version');

const banner = read('source/src/modules/update/UpdateBanner.jsx');
ok(banner.includes('Update ready'), 'Update banner copy exists');
ok(banner.includes('Saving before update'), 'Update banner saving state exists');
ok(banner.includes('Update safely'), 'Update banner primary action exists');

const css = read('source/src/styles.css');
ok(css.includes('update-safe-banner'), 'update banner styles exist');
ok(css.includes('env(safe-area-inset-bottom)'), 'update banner respects iPhone safe area');

const pkg = JSON.parse(read('package.json'));
ok(pkg.version === '95.60.0', 'package version updated');

console.log(`verify-safe-update-v9558: ${checks} checks PASS`);
