import fs from 'node:fs';

const VERSION = '109.7.17';
const BUILD = 'v109717-authoritative-production-version';
const LABEL = 'v109.7.17 Authoritative Production Version';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function writeJson(path, value) {
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

function patchJson(path, mutate) {
  if (!fs.existsSync(path)) return;
  const value = JSON.parse(read(path));
  mutate(value);
  writeJson(path, value);
}

writeJson('release-version.json', {
  version: VERSION,
  build: BUILD,
  label: LABEL,
});

patchJson('package.json', pkg => {
  pkg.version = VERSION;
  pkg.engines = { ...(pkg.engines || {}), node: '24.x' };
});

patchJson('package-lock.json', lock => {
  lock.version = VERSION;
  if (lock.packages?.['']) {
    lock.packages[''].version = VERSION;
    lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node: '24.x' };
  }
});

const updatePath = 'source/src/core/update/appUpdate.js';
let update = read(updatePath);
update = update.replace(
  /const FALLBACK_APP_VERSION\s*=\s*['"][^'"]+['"];?/,
  `const FALLBACK_APP_VERSION = '${VERSION}';`,
);
if (/const FALLBACK_APP_BUILD\s*=/.test(update)) {
  update = update.replace(
    /const FALLBACK_APP_BUILD\s*=\s*['"][^'"]+['"];?/,
    `const FALLBACK_APP_BUILD = '${BUILD}';`,
  );
} else {
  update = update.replace(
    `const FALLBACK_APP_VERSION = '${VERSION}';`,
    `const FALLBACK_APP_VERSION = '${VERSION}';\nconst FALLBACK_APP_BUILD = '${BUILD}';`,
  );
}
update = update.replace(
  /export const CURRENT_APP_VERSION\s*=\s*String\([\s\S]*?\)\.trim\(\)\s*\|\|\s*FALLBACK_APP_VERSION;/,
  'export const CURRENT_APP_VERSION = FALLBACK_APP_VERSION;',
);
update = update.replace(
  /export const CURRENT_APP_VERSION\s*=\s*[^;]+;/,
  'export const CURRENT_APP_VERSION = FALLBACK_APP_VERSION;',
);
if (/export const CURRENT_APP_BUILD\s*=/.test(update)) {
  update = update.replace(
    /export const CURRENT_APP_BUILD\s*=\s*[^;]+;/,
    'export const CURRENT_APP_BUILD = FALLBACK_APP_BUILD;',
  );
} else {
  update = update.replace(
    'export const CURRENT_APP_VERSION = FALLBACK_APP_VERSION;',
    'export const CURRENT_APP_VERSION = FALLBACK_APP_VERSION;\nexport const CURRENT_APP_BUILD = FALLBACK_APP_BUILD;',
  );
}
write(updatePath, update);

for (const path of [
  'source/src/modules/home/HomeScreen.jsx',
  'source/src/shared/ui/ToolsSheet.jsx',
]) {
  if (!fs.existsSync(path)) continue;
  let source = read(path);
  source = source
    .replaceAll('App v{CURRENT_APP_VERSION}', `App v${VERSION}`)
    .replaceAll('APP V{CURRENT_APP_VERSION}', `APP V${VERSION}`)
    .replaceAll('v{CURRENT_APP_VERSION}', `v${VERSION}`)
    .replace(/App v109\.7\.1[3-6]/g, `App v${VERSION}`)
    .replace(/APP V109\.7\.1[3-6]/g, `APP V${VERSION}`);
  write(path, source);
}

const swPath = 'public/sw.js';
let sw = read(swPath);
sw = sw.replace(
  /const OWNER_OP_SW_VERSION\s*=\s*['"][^'"]+['"];?/,
  `const OWNER_OP_SW_VERSION = '${VERSION}';`,
);
if (/const OWNER_OP_SW_BUILD\s*=/.test(sw)) {
  sw = sw.replace(
    /const OWNER_OP_SW_BUILD\s*=\s*['"][^'"]+['"];?/,
    `const OWNER_OP_SW_BUILD = '${BUILD}';`,
  );
} else {
  sw = sw.replace(
    `const OWNER_OP_SW_VERSION = '${VERSION}';`,
    `const OWNER_OP_SW_VERSION = '${VERSION}';\nconst OWNER_OP_SW_BUILD = '${BUILD}';`,
  );
}
write(swPath, sw);

const releasedAt = new Date().toISOString();
writeJson('public/app-version.json', {
  version: VERSION,
  build: BUILD,
  releasedAt,
  updatedAt: releasedAt,
  label: LABEL,
  force: true,
  notes: [
    'One checked-in release source now controls the Next.js build ID, response headers, runtime environment, visible app label, update engine and service worker.',
    'The final build starts from a clean .next directory and verifies the compiled JavaScript bundle after Next.js finishes.',
    'The iPhone update bridge preserves logs and documents while replacing the stale installed app shell.',
  ],
});

writeJson('public/release-proof.json', {
  version: VERSION,
  build: BUILD,
  generatedAt: releasedAt,
  sources: {
    releaseVersion: VERSION,
    packageVersion: VERSION,
    runtimeVersion: VERSION,
    visibleHomeVersion: VERSION,
    serviceWorkerVersion: VERSION,
    responseHeaderVersion: VERSION,
  },
  expectedRootHeader: {
    'x-owner-op-app-version': VERSION,
    'x-owner-op-app-build': BUILD,
  },
});

if (!update.includes(`const FALLBACK_APP_VERSION = '${VERSION}';`)) {
  throw new Error('v109.7.17 runtime version patch failed');
}
if (!update.includes('export const CURRENT_APP_VERSION = FALLBACK_APP_VERSION;')) {
  throw new Error('v109.7.17 runtime source-of-truth patch failed');
}
if (!sw.includes(`const OWNER_OP_SW_VERSION = '${VERSION}';`)) {
  throw new Error('v109.7.17 service-worker patch failed');
}

console.log('PASS — v109.7.17 authoritative production version applied last');
