import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '109.3.4';
const BUILD = 'v10934-forced-update-bootstrap';
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
    if (!source.includes(pattern)) throw new Error(`v109.3.4 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.3.4 missing ${label}`);
}

write(
  'source/src/core/update/appUpdate.js',
  read('scripts/v10934-update/appUpdateV10934.js.txt'),
);

write('source/src/modules/update/UpdateBanner.jsx', `import React from 'react';
import { CURRENT_APP_BUILD, CURRENT_APP_VERSION } from '../../core/update/appUpdate.js';

export default function UpdateBanner({ updateState, onApply, onDismiss }) {
  if (!updateState?.available && updateState?.saveState !== 'saving-update') return null;
  const busy = updateState?.saveState === 'saving-update';
  const remote = updateState?.remote || {};
  const latest = remote.version || updateState?.latestVersion || '';
  const forced = remote.force === true;
  return (
    <div
      className="update-safe-banner"
      data-owner-op-update-banner="109.3.4"
      role="status"
      aria-live="assertive"
      style={{
        position:'fixed',
        left:10,
        right:10,
        bottom:'calc(10px + env(safe-area-inset-bottom))',
        zIndex:2147483000,
        border:'1px solid #bfdbfe',
        borderRadius:18,
        background:'#0f172a',
        color:'#fff',
        padding:12,
        boxShadow:'0 22px 70px rgba(15,23,42,.48)',
        display:'grid',
        gridTemplateColumns:'minmax(0,1fr) auto',
        gap:10,
        alignItems:'center',
      }}
    >
      <div className="update-safe-copy" style={{ minWidth:0 }}>
        <b style={{ display:'block', fontSize:14 }}>{busy ? 'Saving before update' : forced ? 'Required app refresh' : 'Update ready'}</b>
        <span style={{ display:'block', marginTop:3, fontSize:11, lineHeight:1.35, color:'#cbd5e1' }}>
          {busy
            ? 'Logs are being saved on this phone first.'
            : `v${latest || 'new'} · ${remote.build || 'latest build'} · current v${CURRENT_APP_VERSION} / ${CURRENT_APP_BUILD}`}
        </span>
      </div>
      <div className="update-safe-actions" style={{ display:'flex', gap:7, alignItems:'center' }}>
        <button type="button" className="update-safe-primary" onClick={onApply} disabled={busy} style={{ minHeight:42, border:0, borderRadius:13, padding:'0 13px', background:'#2563eb', color:'#fff', fontWeight:950 }}>
          {busy ? 'Saving…' : 'Reload latest'}
        </button>
        {!busy && !forced ? <button type="button" className="update-safe-secondary" onClick={onDismiss} style={{ minHeight:42, border:'1px solid #475569', borderRadius:13, padding:'0 10px', background:'#1e293b', color:'#fff', fontWeight:850 }}>Later</button> : null}
      </div>
    </div>
  );
}
`);

write('source/src/shared/ui/ToolsSheet.jsx', `import React from 'react';
import { CURRENT_APP_BUILD, CURRENT_APP_VERSION } from '../../core/update/appUpdate.js';
import { getHomeTerminalTimeZone, timeZoneSettingSummary } from '../../core/time/homeTerminalTime.js';

export default function ToolsSheet({ state, onClose, onDot, onWallet, onMove, onBackup, onDayTransfer, onTimeZone, updateState, onCheckUpdate, onApplyUpdate, onClearTestDates }) {
  const available = !!updateState?.available;
  const remote = updateState?.remote || {};
  const latest = remote.version || updateState?.latestVersion || CURRENT_APP_VERSION;
  const checking = !!updateState?.checking;
  const saving = updateState?.saveState === 'saving-update';
  const logTimeZone = getHomeTerminalTimeZone(state);
  const logTimeZoneSummary = timeZoneSettingSummary(logTimeZone);

  return (
    <div className="sheet active tools-sheet">
      <div className="sheet-head"><button onClick={onClose}>‹</button><div>Log Tools</div><span></span></div>
      <div className="choice-body">
        <button className="choice-card" onClick={onDot}><b>DOT Inspection</b><span>Email officer report or open inspection-safe DOT Mode on this device.</span></button>
        <button className="choice-card" onClick={onWallet}><b>DOT Digital Wallet</b><span>CDL, medical, registration, insurance, annual inspection, BOL, and expiration reminders.</span></button>
        <button className="choice-card" onClick={onDayTransfer}><b>Export / import this day</b><span>{state.activeDay}. Save one log day or restore a day file into this exact date.</span></button>
        <button className="choice-card" onClick={onBackup}><b>Backup Logs</b><span>Export or import logs, signatures, inspections, routes, wallet docs, and attachments.</span></button>
        <button className="choice-card" onClick={onTimeZone}><b>Log Time Zone</b><span>{logTimeZoneSummary}. Used for DOT log days, rollover, Today, and current open driving time.</span></button>
        <button className="choice-card" onClick={onMove}><b>Shift day events</b><span>Select all real events for this day and move them forward or backward together.</span></button>
        <button className={\`choice-card \${available ? 'update-ready' : ''}\`} onClick={available ? onApplyUpdate : onCheckUpdate} disabled={saving}>
          <b>{available ? 'Update ready' : 'Check app update'}</b>
          <span>{saving ? 'Saving logs before update…' : available ? \`v\${latest} · \${remote.build || 'latest build'}. Saves logs first, then performs a clean reload.\` : \`Current v\${CURRENT_APP_VERSION} · \${CURRENT_APP_BUILD}.\`}</span>
          <em>{checking ? 'Checking…' : available ? 'Reload latest' : 'Check now'}</em>
        </button>
        <button className="choice-card update-ready" onClick={onApplyUpdate} disabled={saving} data-force-latest-build="109.3.4">
          <b>Force reload latest build</b>
          <span>Use this when the version number changed but the scanner screen still looks old. Logs are saved before caches and the service worker are reset.</span>
          <em>{saving ? 'Saving…' : 'Reload clean'}</em>
        </button>
        <button className="choice-card danger" onClick={onClearTestDates}><b>Clear test dates</b><span>Deletes log dates, events, signatures, inspections, route/load test data, and GPS trip data so you can start a fresh test.</span></button>
      </div>
    </div>
  );
}
`);

write('source/src/app/api/app-version/route.js', `export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RELEASE = Object.freeze({
  version:'${VERSION}',
  build:'${BUILD}',
  releasedAt:'${RELEASED_AT}',
  updatedAt:'${RELEASED_AT}',
  label:'v109.3.4 Reliable Update Bootstrap',
  force:true,
  notes:[
    'Forces stale iPhone app shells to offer the latest build even when the visible version previously matched.',
    'Uses a no-store API version endpoint and a dedicated cache-clearing update bootstrap page.',
    'Keeps all driver logs and Document Vault data on the same origin while replacing stale app code.',
  ],
});

export async function GET() {
  return Response.json(RELEASE, {
    headers:{
      'Cache-Control':'no-store, no-cache, max-age=0, must-revalidate, proxy-revalidate',
      Pragma:'no-cache',
      Expires:'0',
      'Surrogate-Control':'no-store',
      'CDN-Cache-Control':'no-store',
    },
  });
}
`);

write('public/update.html', `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>Updating Road Ready</title>
  <style>
    html,body{height:100%;margin:0;background:#0f172a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body{display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{width:min(420px,100%);text-align:center}.spinner{width:54px;height:54px;margin:0 auto 18px;border:5px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:s .8s linear infinite}@keyframes s{to{transform:rotate(360deg)}}h1{font-size:23px;margin:0}p{color:#cbd5e1;line-height:1.5;margin:10px 0 18px}button{display:none;width:100%;min-height:50px;border:0;border-radius:15px;background:#2563eb;color:#fff;font-weight:900;font-size:16px}
  </style>
</head>
<body>
  <main class="card">
    <div class="spinner"></div>
    <h1>Loading the latest Road Ready</h1>
    <p id="status">Saving your data, clearing stale app code and reopening the same app.</p>
    <button id="continue" type="button">Continue</button>
  </main>
  <script>
    (() => {
      const params = new URLSearchParams(location.search);
      const version = params.get('version') || '${VERSION}';
      const build = params.get('build') || '${BUILD}';
      const returnPath = params.get('return') || '/';
      const status = document.getElementById('status');
      const button = document.getElementById('continue');

      function destination() {
        const url = new URL(returnPath, location.origin);
        url.searchParams.set('road_ready_update', version);
        url.searchParams.set('road_ready_build', build);
        url.searchParams.set('fresh', String(Date.now()));
        return url.toString();
      }

      async function clearReleaseCaches() {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
          for (const registration of registrations) {
            try {
              registration.active?.postMessage?.({ type:'OWNER_OP_RELEASE_CONTROL', version, build });
              registration.waiting?.postMessage?.({ type:'OWNER_OP_RELEASE_CONTROL', version, build });
              registration.installing?.postMessage?.({ type:'OWNER_OP_RELEASE_CONTROL', version, build });
              await registration.unregister();
            } catch {}
          }
        }
        if ('caches' in window) {
          const keys = await caches.keys().catch(() => []);
          await Promise.all(keys.map(key => caches.delete(key).catch(() => false)));
        }
        try {
          await fetch('/api/app-version?boot=' + Date.now(), {
            cache:'reload',
            credentials:'same-origin',
            headers:{ 'cache-control':'no-cache, no-store, max-age=0' },
          });
        } catch {}
      }

      async function run() {
        try {
          await clearReleaseCaches();
          status.textContent = 'Latest build verified. Reopening Road Ready…';
          setTimeout(() => location.replace(destination()), 120);
        } catch (error) {
          status.textContent = 'The automatic refresh was blocked. Tap Continue to reopen the latest build.';
          button.style.display = 'block';
          button.onclick = () => location.replace(destination());
        }
      }

      run();
      setTimeout(() => {
        button.style.display = 'block';
        button.onclick = () => location.replace(destination());
      }, 7000);
    })();
  </script>
</body>
</html>
`);

write('public/sw.js', `const OWNER_OP_SW_VERSION = '${VERSION}';
const OWNER_OP_SW_BUILD = '${BUILD}';

async function clearAllCaches() {
  if (typeof caches === 'undefined') return;
  const keys = await caches.keys();
  await Promise.all(keys.map(key => caches.delete(key)));
}

async function notifyClients(type) {
  const clients = await self.clients.matchAll({ includeUncontrolled:true, type:'window' });
  for (const client of clients) client.postMessage({ type, version:OWNER_OP_SW_VERSION, build:OWNER_OP_SW_BUILD });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await clearAllCaches();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await clearAllCaches();
    await self.clients.claim();
    await notifyClients('OWNER_OP_SW_READY');
  })());
});

self.addEventListener('message', event => {
  const type = event?.data?.type;
  if (type === 'OWNER_OP_APPLY_UPDATE' || type === 'OWNER_OP_SKIP_WAITING') {
    event.waitUntil((async () => {
      await clearAllCaches();
      await self.skipWaiting();
      event.source?.postMessage?.({ type:'OWNER_OP_SW_UPDATE_ACK', version:OWNER_OP_SW_VERSION, build:OWNER_OP_SW_BUILD });
    })());
    return;
  }
  if (type === 'OWNER_OP_RELEASE_CONTROL') {
    event.waitUntil((async () => {
      await clearAllCaches();
      await self.registration.unregister();
    })());
    return;
  }
  if (type === 'OWNER_OP_GET_VERSION') {
    event.source?.postMessage?.({ type:'OWNER_OP_SW_VERSION', version:OWNER_OP_SW_VERSION, build:OWNER_OP_SW_BUILD });
  }
});

self.addEventListener('sync', event => {
  if (event.tag !== 'owner-op-sync') return;
  event.waitUntil(notifyClients('OWNER_OP_BACKGROUND_SYNC'));
});
`);

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
  `        const dismissalKey = \`${'${remote.version}'}:${'${remote.build || \'\'}'}\`;
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
        dismissedVersion:\`${'${prev.remote?.version || prev.latestVersion || \'\'}'}:${'${prev.remote?.build || \'\'}'}\`,
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
    'Detection {confidence}% · 4 corner frame · build 109.3.4',
    'scanner review build marker',
  ),
);

const scannerUiPath = 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx';
write(
  scannerUiPath,
  replaceRequired(
    read(scannerUiPath),
    'Road Ready Scanner 0.4.4',
    'Road Ready Scanner 0.4.4 · App 109.3.4',
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
scannerManifest.updateBootstrap = 'cache-reset-v10934';
write('public/scanner-engine.json', `${JSON.stringify(scannerManifest, null, 2)}\n`);

const release = {
  version:VERSION,
  build:BUILD,
  releasedAt:RELEASED_AT,
  updatedAt:RELEASED_AT,
  label:'v109.3.4 Reliable Update Bootstrap',
  force:true,
  notes:[
    'Forces a new release number so an iPhone shell that believed it already had the latest scanner offers Update again.',
    'Checks a dynamic no-store version endpoint before the static manifest.',
    'Uses a dedicated update page that unregisters stale service workers and clears browser Cache Storage before reopening.',
    'Keeps the approved four-corner scanner, native-detail renderer, logs and saved documents unchanged.',
  ],
};
write('public/app-version.json', `${JSON.stringify(release, null, 2)}\n`);

const required = [
  ['source/src/core/update/appUpdate.js', 'shouldOfferAppUpdate'],
  ['source/src/core/update/appUpdate.js', "UPDATE_BOOT_URL = '/update.html'"],
  ['source/src/modules/update/UpdateBanner.jsx', 'data-owner-op-update-banner="109.3.4"'],
  ['source/src/shared/ui/ToolsSheet.jsx', 'Force reload latest build'],
  ['source/src/app/App.jsx', 'shouldOfferAppUpdate(remote)'],
  ['source/src/app/App.jsx', "window.addEventListener('pageshow', onPageShow)"],
  ['source/src/app/api/app-version/route.js', 'force:true'],
  ['public/update.html', 'navigator.serviceWorker.getRegistrations'],
  ['public/update.html', 'caches.delete'],
  ['public/sw.js', `OWNER_OP_SW_VERSION = '${VERSION}'`],
  ['source/src/modules/scan/v3/ReviewScreenV3.jsx', 'build 109.3.4'],
  ['public/app-version.json', BUILD],
];
for (const [relative, marker] of required) {
  if (!read(relative).includes(marker)) throw new Error(`${relative} is missing ${marker}`);
}

console.log('PASS — v109.3.4 forced update bootstrap applied');
