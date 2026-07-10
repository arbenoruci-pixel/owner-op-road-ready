import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const write = (relativePath, value) => fs.writeFileSync(path.join(root, relativePath), value);

const packageJson = JSON.parse(read('package.json'));
const version = String(packageJson.version || '').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`package.json version must be numeric semver, received: ${version || '(empty)'}`);
}

const changes = [];

function syncText(relativePath, transform) {
  const before = read(relativePath);
  const after = transform(before);
  if (after === before) return;
  changes.push(relativePath);
  if (!checkOnly) write(relativePath, after);
}

syncText('source/src/core/update/appUpdate.js', text => {
  const next = text.replace(
    /const FALLBACK_APP_VERSION = '[^']+';/,
    `const FALLBACK_APP_VERSION = '${version}';`,
  );
  if (next === text && !text.includes(`const FALLBACK_APP_VERSION = '${version}';`)) {
    throw new Error('Could not synchronize FALLBACK_APP_VERSION');
  }
  return next;
});

syncText('public/sw.js', text => {
  const next = text.replace(
    /const OWNER_OP_SW_VERSION = '[^']+';/,
    `const OWNER_OP_SW_VERSION = '${version}';`,
  );
  if (next === text && !text.includes(`const OWNER_OP_SW_VERSION = '${version}';`)) {
    throw new Error('Could not synchronize OWNER_OP_SW_VERSION');
  }
  return next;
});

const appVersionPath = 'public/app-version.json';
const appVersion = JSON.parse(read(appVersionPath));
if (String(appVersion.version || '') !== version) {
  changes.push(appVersionPath);
  appVersion.version = version;
  if (!checkOnly) write(appVersionPath, `${JSON.stringify(appVersion, null, 2)}\n`);
}

const lockPath = 'package-lock.json';
if (fs.existsSync(path.join(root, lockPath))) {
  const lock = JSON.parse(read(lockPath));
  let lockChanged = false;
  if (lock.version !== version) {
    lock.version = version;
    lockChanged = true;
  }
  if (lock.packages?.[''] && lock.packages[''].version !== version) {
    lock.packages[''].version = version;
    lockChanged = true;
  }
  if (lockChanged) {
    changes.push(lockPath);
    if (!checkOnly) write(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  }
}

if (checkOnly && changes.length) {
  console.error(`Version metadata is out of sync with package.json ${version}: ${changes.join(', ')}`);
  process.exit(1);
}

console.log(
  changes.length
    ? `${checkOnly ? 'Would synchronize' : 'Synchronized'} ${version}: ${changes.join(', ')}`
    : `Version metadata already synchronized at ${version}`,
);
