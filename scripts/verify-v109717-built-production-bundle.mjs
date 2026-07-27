import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const VERSION = '109.7.19';
const BUILD = 'v109719-open-exact-load-evidence';
const NEXT_DIR = '.next';

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

assert.ok(fs.existsSync(NEXT_DIR), '.next output is missing');
const buildId = fs.readFileSync(path.join(NEXT_DIR, 'BUILD_ID'), 'utf8').trim();
assert.equal(buildId, BUILD);

const chunkFiles = walk(path.join(NEXT_DIR, 'static', 'chunks')).filter(file => file.endsWith('.js'));
assert.ok(chunkFiles.length > 0, 'No compiled JavaScript chunks were produced');
const chunkRows = chunkFiles.map(file => ({ file, text:fs.readFileSync(file, 'utf8') }));
const visible = chunkRows.find(row => row.text.includes(`App v${VERSION}`));
assert.ok(visible, `Compiled Home bundle does not contain App v${VERSION}`);
assert.ok(chunkRows.some(row=>row.text.includes('Open Rate Con')),'Compiled bundle lacks completed evidence Open actions');
assert.ok(chunkRows.some(row=>row.text.includes('Open Miles')),'Compiled bundle lacks Open Miles action');
for (const stale of ['App v109.7.13','App v109.7.14','App v109.7.15','App v109.7.16','App v109.7.17','App v109.7.18']) {
  assert.ok(!chunkRows.some(row => row.text.includes(stale)), `Compiled bundle still contains stale visible label ${stale}`);
}

const routesPath = path.join(NEXT_DIR, 'routes-manifest.json');
assert.ok(fs.existsSync(routesPath), 'routes-manifest.json is missing');
const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
const headerRules = Array.isArray(routes.headers) ? routes.headers : [];
const allHeaders = headerRules.flatMap(rule => rule.headers || []);
const versionHeader = allHeaders.find(header => String(header.key || '').toLowerCase() === 'x-owner-op-app-version');
const buildHeader = allHeaders.find(header => String(header.key || '').toLowerCase() === 'x-owner-op-app-build');
assert.equal(versionHeader?.value, VERSION);
assert.equal(buildHeader?.value, BUILD);

console.log(`PASS — compiled Home chunk ${path.basename(visible.file)} contains App v${VERSION}`);
console.log('PASS — compiled load folders include exact-day evidence Open actions');
console.log(`PASS — Next BUILD_ID is ${buildId}`);
console.log(`PASS — production route headers compile to ${VERSION} / ${BUILD}`);
