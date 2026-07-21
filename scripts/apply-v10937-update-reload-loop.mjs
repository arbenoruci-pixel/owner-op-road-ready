import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '109.3.7';
const BUILD = 'v10937-update-reload-completion';
const RELEASED_AT = new Date().toISOString();

const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
};

function replaceRequired(source, pattern, replacement, label) {
  if (typeof pattern === 'string') {
    if (source.includes(replacement)) return source;
    if (!source.includes(pattern)) throw new Error(`v109.3.7 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.3.7 missing ${label}`);
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`v109.3.7 missing ${label}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

// The app shell must identify the code bundled into this exact deployment.
// A stale NEXT_PUBLIC_* environment value must never keep the update banner alive.
const updatePath = 'source/src/core/update/appUpdate.js';
let update = read(updatePath);
update = replaceRequired(
  update,
  /const FALLBACK_APP_VERSION = '[^']+';/,
  `const FALLBACK_APP_VERSION = '${VERSION}';`,
  'fallback app version',
);
update = replaceRequired(
  update,
  /const FALLBACK_APP_BUILD = '[^']+';/,
  `const FALLBACK_APP_BUILD = '${BUILD}';`,
  'fallback app build',
);
update = replaceBlock(
  update,
  'export const CURRENT_APP_VERSION',
  'export const APP_VERSION_URL',
  `export const CURRENT_APP_VERSION = FALLBACK_APP_VERSION;\n\nexport const CURRENT_APP_BUILD = FALLBACK_APP_BUILD;\n\n`,
  'bundled release constants',
);
update = replaceRequired(
  update,
  /export const UPDATE_WORKER_TIMEOUT_MS = [^;]+;/,
  'export const UPDATE_WORKER_TIMEOUT_MS = 1_500;',
  'worker timeout',
);
write(updatePath, update);

// Navigate to the dedicated cache-clearing page immediately after a short,
// best-effort local save. Do not hold the button for the service-worker timeout.
const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
const safeUpdateHandler = `  async function applySafeAppUpdate() {
    if (updateState.saveState === 'saving-update') return;
    if (typeof window !== 'undefined' && window.__OWNER_OP_UPDATE_NAVIGATING__) return;

    const remote = updateState.remote || { version:updateState.latestVersion };
    const meta = buildUpdateMeta(remote, 'reload_completion_v10937');
    const target = updateReloadUrl(remote) || (typeof window !== 'undefined' ? window.location.href : '');
    let navigated = false;

    const navigate = () => {
      if (navigated || typeof window === 'undefined') return;
      navigated = true;
      window.__OWNER_OP_UPDATE_NAVIGATING__ = true;
      try {
        window.location.replace(target);
      } catch {
        window.location.href = target;
      }
    };

    setUpdateState(prev => ({ ...prev, saveState:'saving-update', error:'' }));
    const navigationWatchdogV10937 = setTimeout(navigate, 1_200);

    try {
      await Promise.race([
        Promise.allSettled([
          saveAppSnapshot(APP_STATE_KEY, state),
          savePreUpdateSnapshot(state, meta),
        ]),
        new Promise(resolve => setTimeout(resolve, 650)),
      ]);

      setUpdateState(prev => ({
        ...prev,
        saveState:'saved',
        lastPreUpdateBackupAt:meta.createdAt,
      }));

      // The dedicated update page owns service-worker release and cache cleanup.
      // Start this request in parallel, then navigate without waiting for it.
      requestServiceWorkerUpdate(remote, meta).catch(() => {});
      clearTimeout(navigationWatchdogV10937);
      navigate();
    } catch (error) {
      clearTimeout(navigationWatchdogV10937);
      setUpdateState(prev => ({
        ...prev,
        saveState:'failed',
        error:error?.message || 'Opening latest build',
      }));
      navigate();
    }
  }`;
app = replaceBlock(
  app,
  '  async function applySafeAppUpdate() {',
  '\n\n  React.useEffect(() => {',
  safeUpdateHandler,
  'safe update handler',
);
write(appPath, app);

const bannerPath = 'source/src/modules/update/UpdateBanner.jsx';
let banner = read(bannerPath);
banner = replaceRequired(
  banner,
  /data-owner-op-update-banner="[^"]+"/,
  `data-owner-op-update-banner="${VERSION}"`,
  'update banner marker',
);
banner = replaceRequired(banner, "busy ? 'Saving before update'", "busy ? 'Opening latest build'", 'busy title');
banner = replaceRequired(banner, "? 'Logs are being saved on this phone first.'", "? 'Finishing the local save and reopening fresh app code.'", 'busy description');
banner = replaceRequired(banner, "{busy ? 'Saving…' : 'Reload latest'}", "{busy ? 'Opening…' : 'Reload latest'}", 'busy button label');
write(bannerPath, banner);

// The update page always leaves within 1.4 seconds, even if Safari does not
// resolve a service-worker unregister promise promptly.
const bootPath = 'public/update.html';
let boot = read(bootPath);
boot = replaceRequired(boot, /const version = params\.get\('version'\) \|\| '[^']+';/, `const version = params.get('version') || '${VERSION}';`, 'update page version');
boot = replaceRequired(boot, /const build = params\.get\('build'\) \|\| '[^']+';/, `const build = params.get('build') || '${BUILD}';`, 'update page build');
const bootRun = `      async function run() {
        const target = nextUrl();
        let completed = false;
        const go = () => {
          if (completed) return;
          completed = true;
          try {
            location.replace(target);
          } catch {
            location.href = target;
          }
        };

        button.onclick = go;
        const navigationWatchdogV10937 = setTimeout(go, 1_400);
        try {
          await Promise.race([
            releaseOldApp(),
            new Promise(resolve => setTimeout(resolve, 850)),
          ]);
          status.textContent = \`Opening Road Ready v\${version}…\`;
          clearTimeout(navigationWatchdogV10937);
          setTimeout(go, 40);
        } catch {
          status.textContent = 'Opening the latest Road Ready build…';
          clearTimeout(navigationWatchdogV10937);
          go();
        }
      }`;
boot = replaceBlock(boot, '      async function run() {', '\n\n      run();', bootRun, 'update boot run');
boot = replaceRequired(boot, '}, 7000);', '}, 2200);', 'manual continue delay');
write(bootPath, boot);

const swPath = 'public/sw.js';
let sw = read(swPath);
sw = replaceRequired(sw, /const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`, 'service worker version');
sw = replaceRequired(sw, /const OWNER_OP_SW_BUILD = '[^']+';/, `const OWNER_OP_SW_BUILD = '${BUILD}';`, 'service worker build');
write(swPath, sw);

// Keep every visible and persisted release marker synchronized with the bundle.
const reviewPath = 'source/src/modules/scan/v3/ReviewScreenV3.jsx';
write(
  reviewPath,
  replaceRequired(
    read(reviewPath),
    /build 109\.3\.[0-9]+/,
    `build ${VERSION}`,
    'review build marker',
  ),
);

const scannerUiPath = 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx';
let scannerUi = read(scannerUiPath);
scannerUi = replaceRequired(scannerUi, /App 109\.3\.[0-9]+/, `App ${VERSION}`, 'scanner app marker');
write(scannerUiPath, scannerUi);

const scannerTypesPath = 'source/src/modules/scan/v3/scannerTypesV3.js';
write(scannerTypesPath, replaceRequired(read(scannerTypesPath), /export const ROAD_READY_SCANNER_V3_VERSION = '[^']+';/, `export const ROAD_READY_SCANNER_V3_VERSION = '${VERSION}';`, 'scanner version constant'));
const contractsPath = 'source/src/modules/scan/scannerContractsV106.js';
write(contractsPath, replaceRequired(read(contractsPath), /export const ROAD_READY_SCANNER_VERSION_V106 = '[^']+';/, `export const ROAD_READY_SCANNER_VERSION_V106 = '${VERSION}';`, 'scanner contract version'));
const scanSheetPath = 'source/src/modules/scan/SmartScanSheetV105.jsx';
write(scanSheetPath, replaceRequired(read(scanSheetPath), /scannerVersion:analysis\?\.scanMeta\?\.scannerVersion \|\| '[^']+'/, `scannerVersion:analysis?.scanMeta?.scannerVersion || '${VERSION}'`, 'scan persistence version'));

const packageJson = JSON.parse(read('package.json'));
packageJson.version = VERSION;
packageJson.engines = { ...(packageJson.engines || {}), node:'24.x' };
write('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
const packageLock = JSON.parse(read('package-lock.json'));
packageLock.version = VERSION;
if (packageLock.packages?.['']) {
  packageLock.packages[''].version = VERSION;
  packageLock.packages[''].engines = { ...(packageLock.packages[''].engines || {}), node:'24.x' };
}
write('package-lock.json', `${JSON.stringify(packageLock, null, 2)}\n`);

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
scannerManifest.version = VERSION;
scannerManifest.updateBootstrap = BUILD;
scannerManifest.visibleBuildMarker = VERSION;
scannerManifest.updateNavigation = 'immediate-update-page-v10937';
scannerManifest.bundledVersionBuildSynchronized = true;
write('public/scanner-engine.json', `${JSON.stringify(scannerManifest, null, 2)}\n`);

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt:RELEASED_AT,
  updatedAt:RELEASED_AT,
  label:'v109.3.7 Reload Completion · Scanner 0.4.7',
  force:true,
  notes:[
    'Synchronizes the bundled app version and build with the release manifest so Reload latest completes instead of reopening the same banner.',
    'Ignores stale NEXT_PUBLIC version values and uses the code bundled in the active deployment as the current release identity.',
    'Navigates to the dedicated cache-clearing update page after a short best-effort local save without waiting for the service-worker timeout.',
    'Adds navigation watchdogs in both the app and update page for iPhone Safari and installed PWA sessions.',
    'Keeps Scanner 0.4.7 quality, the four-corner selector, Logbook data, HOS and document storage unchanged.',
  ],
}, null, 2)}\n`);

console.log('PASS — v109.3.7 update reload loop fix applied');
