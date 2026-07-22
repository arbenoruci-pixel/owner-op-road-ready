import fs from 'node:fs';
import path from 'node:path';

const VERSION = '109.6.0';
const BUILD = 'v10960-iphone-force-update-recovery';

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive:true });
  fs.writeFileSync(filePath, content);
}

function writeJson(filePath, transform) {
  const value = JSON.parse(read(filePath));
  transform(value);
  write(filePath, JSON.stringify(value, null, 2) + '\n');
}

const recoveryPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>Repairing Road Ready Update</title>
  <style>
    :root{color-scheme:dark}*{box-sizing:border-box}html,body{min-height:100%;margin:0;background:#071426;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{display:grid;place-items:center;padding:24px}.card{width:min(440px,100%);padding:28px 22px;border:1px solid rgba(148,163,184,.24);border-radius:28px;background:linear-gradient(180deg,#10223b,#0b1729);box-shadow:0 22px 70px rgba(0,0,0,.35);text-align:center}.mark{display:grid;place-items:center;width:70px;height:70px;margin:0 auto 18px;border-radius:22px;background:#19c997;color:#05251d;font-size:32px;font-weight:1000}.spinner{width:46px;height:46px;margin:18px auto;border:5px solid #31445e;border-top-color:#43e3b6;border-radius:50%;animation:s .75s linear infinite}@keyframes s{to{transform:rotate(360deg)}}h1{margin:0;font-size:25px;line-height:1.15}p{margin:10px 0;color:#c9d5e5;font-size:15px;line-height:1.5}.version{display:inline-flex;margin-top:4px;padding:7px 11px;border-radius:999px;background:#183354;color:#9ed7ff;font-size:12px;font-weight:900}button{display:none;width:100%;min-height:54px;margin-top:18px;border:0;border-radius:17px;background:#20c997;color:#05251d;font-size:17px;font-weight:1000}.small{margin-top:14px;color:#8293aa;font-size:12px}
  </style>
</head>
<body>
  <main class="card">
    <div class="mark">↻</div>
    <h1>Repairing Road Ready</h1>
    <p id="status">Removing the old 109.5.6 app shell and loading the latest build.</p>
    <span class="version">Target v${VERSION}</span>
    <div id="spinner" class="spinner"></div>
    <button id="continue" type="button">Open latest Road Ready</button>
    <p class="small">Your Logbook, documents and saved app data are kept.</p>
  </main>
  <script>
    (() => {
      const TARGET_VERSION = '${VERSION}';
      const TARGET_BUILD = '${BUILD}';
      const status = document.getElementById('status');
      const button = document.getElementById('continue');
      const spinner = document.getElementById('spinner');
      let finished = false;

      function latestUrl(version = TARGET_VERSION, build = TARGET_BUILD) {
        const target = new URL('/', location.origin);
        target.searchParams.set('road_ready_update', version);
        target.searchParams.set('road_ready_build', build);
        target.searchParams.set('fresh', String(Date.now()));
        target.searchParams.set('force_latest', '1');
        return target.toString();
      }

      async function remoteRelease() {
        try {
          const response = await fetch('/app-version.json?force=' + Date.now() + '&nonce=' + Math.random().toString(36).slice(2), {
            cache:'no-store',
            credentials:'same-origin',
            headers:{ 'cache-control':'no-cache, no-store, max-age=0, must-revalidate', pragma:'no-cache', expires:'0' },
          });
          if (!response.ok) return { version:TARGET_VERSION, build:TARGET_BUILD };
          const value = await response.json();
          return { version:String(value.version || TARGET_VERSION), build:String(value.build || TARGET_BUILD) };
        } catch {
          return { version:TARGET_VERSION, build:TARGET_BUILD };
        }
      }

      async function releaseOldShell() {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
          for (const registration of registrations) {
            try {
              registration.active?.postMessage?.({ type:'OWNER_OP_RELEASE_CONTROL', version:TARGET_VERSION, build:TARGET_BUILD });
              registration.waiting?.postMessage?.({ type:'OWNER_OP_RELEASE_CONTROL', version:TARGET_VERSION, build:TARGET_BUILD });
              registration.installing?.postMessage?.({ type:'OWNER_OP_RELEASE_CONTROL', version:TARGET_VERSION, build:TARGET_BUILD });
            } catch {}
            await Promise.race([
              registration.unregister().catch(() => false),
              new Promise(resolve => setTimeout(resolve, 500)),
            ]);
          }
        }
        if ('caches' in window) {
          const keys = await caches.keys().catch(() => []);
          await Promise.all(keys.map(key => caches.delete(key).catch(() => false)));
        }
        try {
          localStorage.removeItem('owner_op_update_dismissed');
          localStorage.removeItem('road_ready_update_dismissed');
          sessionStorage.clear();
        } catch {}
      }

      function openLatest(release) {
        if (finished) return;
        finished = true;
        status.textContent = 'Opening Road Ready v' + release.version + '…';
        spinner.style.display = 'none';
        const url = latestUrl(release.version, release.build);
        try { location.replace(url); } catch { location.href = url; }
      }

      async function run() {
        const release = await remoteRelease();
        button.onclick = () => openLatest(release);
        const watchdog = setTimeout(() => {
          button.style.display = 'block';
          openLatest(release);
        }, 2600);
        try {
          await Promise.race([
            releaseOldShell(),
            new Promise(resolve => setTimeout(resolve, 1700)),
          ]);
          clearTimeout(watchdog);
          setTimeout(() => openLatest(release), 120);
        } catch {
          clearTimeout(watchdog);
          status.textContent = 'Tap below to finish opening the latest build.';
          spinner.style.display = 'none';
          button.style.display = 'block';
        }
      }

      run();
    })();
  </script>
</body>
</html>
`;

write('public/force-update-10960.html', recoveryPage);
write('public/force-update.html', recoveryPage);

let updateBoot = read('public/update.html');
updateBoot = updateBoot.replace(/const version = params\.get\('version'\) \|\| '[^']+';/, `const version = params.get('version') || '${VERSION}';`);
updateBoot = updateBoot.replace(/const build = params\.get\('build'\) \|\| '[^']+';/, `const build = params.get('build') || '${BUILD}';`);
write('public/update.html', updateBoot);

writeJson('package.json', pkg => {
  pkg.version = VERSION;
  pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
});
if (fs.existsSync('package-lock.json')) {
  writeJson('package-lock.json', lock => {
    lock.version = VERSION;
    if (lock.packages?.['']) {
      lock.packages[''].version = VERSION;
      lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
    }
  });
}

const releasedAt = new Date().toISOString();
write('public/app-version.json', JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt,
  updatedAt:releasedAt,
  label:'v109.6.0 iPhone Update Recovery',
  force:true,
  recoveryUrl:'/force-update-10960.html',
  notes:[
    'Adds a new uncached recovery URL for iPhone installations stuck on an older Road Ready shell.',
    'Unregisters stale service workers and clears only browser code caches before reopening the production app.',
    'Preserves Logbook records, documents, inspections, signatures, loads and business data.',
    'Keeps the isolated Rate Confirmation, POD, BOL and Fuel Receipt engines unchanged at version 1.0.0.',
  ],
}, null, 2) + '\n');

let sw = read('public/sw.js');
sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, `const OWNER_OP_SW_BUILD = '${BUILD}';`);
write('public/sw.js', sw);

let update = read('source/src/core/update/appUpdate.js');
update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`);
update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, `const FALLBACK_APP_BUILD = '${BUILD}';`);
write('source/src/core/update/appUpdate.js', update);

console.log('PASS — v109.6.0 iPhone force-update recovery applied');
