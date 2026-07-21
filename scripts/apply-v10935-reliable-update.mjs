import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '109.3.5';
const BUILD = 'v10935-reliable-update-bootstrap';
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
    if (!source.includes(pattern)) throw new Error(`v109.3.5 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.3.5 missing ${label}`);
}

write('source/src/core/update/appUpdate.js', read('scripts/v10935-update/appUpdateV10935.js.txt'));
write('source/src/modules/update/UpdateBanner.jsx', read('scripts/v10935-update/UpdateBannerV10935.jsx.txt'));
write('source/src/shared/ui/ToolsSheet.jsx', read('scripts/v10935-update/ToolsSheetV10935.jsx.txt'));
write('public/update.html', read('scripts/v10935-update/updateV10935.html.txt'));
write('public/sw.js', read('scripts/v10935-update/swV10935.js.txt'));

const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
app = replaceRequired(
  app,
  "import { CURRENT_APP_VERSION, UPDATE_CHECK_INTERVAL_MS, buildUpdateMeta, fetchRemoteAppVersion, isNewerVersion, requestServiceWorkerUpdate, updateReloadUrl } from '../core/update/appUpdate.js';",
  "import { CURRENT_APP_BUILD, CURRENT_APP_VERSION, UPDATE_CHECK_INTERVAL_MS, buildUpdateMeta, fetchRemoteAppVersion, requestServiceWorkerUpdate, shouldOfferAppUpdate, updateReloadUrl } from '../core/update/appUpdate.js';",
  'App update import',
);
app = replaceRequired(
  app,
  "    currentVersion: CURRENT_APP_VERSION,\n    latestVersion: CURRENT_APP_VERSION,",
  "    currentVersion: CURRENT_APP_VERSION,\n    currentBuild: CURRENT_APP_BUILD,\n    latestVersion: CURRENT_APP_VERSION,",
  'App current build state',
);
app = replaceRequired(
  app,
  `        const available = Boolean(remote.version)
          && isNewerVersion(remote.version, CURRENT_APP_VERSION)
          && prev.dismissedVersion !== remote.version;`,
  `        const dismissalKey = [remote.version, remote.build || ''].join(':');
        const available = shouldOfferAppUpdate(remote)
          && (remote.force === true || prev.dismissedVersion !== dismissalKey);`,
  'App update decision',
);
app = replaceRequired(
  app,
  `  function dismissAppUpdate() {
    setUpdateState(prev => ({
      ...prev,
      available: false,
      dismissedVersion: prev.remote?.version || prev.latestVersion || '',
      saveState: 'idle',
    }));
  }`,
  `  function dismissAppUpdate() {
    setUpdateState(prev => {
      if (prev.remote?.force === true) return prev;
      return {
        ...prev,
        available:false,
        dismissedVersion:[prev.remote?.version || prev.latestVersion || '', prev.remote?.build || ''].join(':'),
        saveState:'idle',
      };
    });
  }`,
  'forced update dismissal guard',
);
app = replaceRequired(
  app,
  `    const onOnline = () => checkForAppUpdate('online');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };`,
  `    const onOnline = () => checkForAppUpdate('online');
    const onFocus = () => checkForAppUpdate('focus');
    const onPageShow = () => checkForAppUpdate('pageshow');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
    };`,
  'extra update wake checks',
);
write(appPath, app);

const reviewPath = 'source/src/modules/scan/v3/ReviewScreenV3.jsx';
write(
  reviewPath,
  replaceRequired(
    read(reviewPath),
    'Detection {confidence}% · 4 corner frame',
    'Detection {confidence}% · 4 corner frame · build 109.3.5',
    'scanner review build marker',
  ),
);

const scannerUiPath = 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx';
write(
  scannerUiPath,
  replaceRequired(
    read(scannerUiPath),
    'Road Ready Scanner 0.4.5',
    'Road Ready Scanner 0.4.5 · App 109.3.5',
    'scanner visible app version',
  ),
);

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
write('public/scanner-engine.json', `${JSON.stringify(scannerManifest, null, 2)}\n`);

const release = {
  version:VERSION,
  build:BUILD,
  releasedAt:RELEASED_AT,
  updatedAt:RELEASED_AT,
  label:'v109.3.5 Reliable iPhone Update · Scanner 0.4.5',
  force:true,
  notes:[
    'Creates a new version above 109.3.4 so every stale iPhone shell must offer Update again.',
    'Checks a cache-busted no-store static release manifest every minute and whenever the app regains focus.',
    'Shows the update banner above scanner and document-viewer overlays and prevents dismissing this forced refresh.',
    'Saves the Logbook before opening a dedicated update page that unregisters stale service workers and clears Cache Storage.',
    'Adds a Force reload latest build action in Log Tools for future recovery.',
    'Keeps the current Scanner 0.4.5 projective source-detail renderer and all Logbook data unchanged.'
  ],
};
write('public/app-version.json', `${JSON.stringify(release, null, 2)}\n`);

const required = [
  ['source/src/core/update/appUpdate.js', "const FALLBACK_APP_VERSION = '109.3.5'"],
  ['source/src/core/update/appUpdate.js', "export const APP_VERSION_URL = '/app-version.json'"],
  ['source/src/core/update/appUpdate.js', 'shouldOfferAppUpdate'],
  ['source/src/core/update/appUpdate.js', "export const UPDATE_BOOT_URL = '/update.html'"],
  ['source/src/modules/update/UpdateBanner.jsx', 'data-owner-op-update-banner="109.3.5"'],
  ['source/src/modules/update/UpdateBanner.jsx', 'zIndex:2147483000'],
  ['source/src/shared/ui/ToolsSheet.jsx', 'data-force-latest-build="109.3.5"'],
  ['public/update.html', "navigator.serviceWorker.getRegistrations()"],
  ['public/update.html', "caches.delete"],
  ['public/sw.js', "const OWNER_OP_SW_VERSION = '109.3.5'"],
  ['source/src/app/App.jsx', 'shouldOfferAppUpdate(remote)'],
  ['source/src/app/App.jsx', "window.addEventListener('pageshow', onPageShow)"],
  ['source/src/modules/scan/v3/ReviewScreenV3.jsx', 'build 109.3.5'],
  ['source/src/modules/scan/v3/RoadReadyScannerV3.jsx', 'App 109.3.5'],
  ['public/app-version.json', BUILD],
];
for (const [relative, marker] of required) {
  if (!read(relative).includes(marker)) throw new Error(`${relative} is missing ${marker}`);
}

console.log('PASS — v109.3.5 reliable update bootstrap applied on Scanner 0.4.5');
