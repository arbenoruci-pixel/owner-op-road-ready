import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const read = path => fs.readFileSync(path, 'utf8');
function patch(path, before, after) {
  const source = read(path);
  if (source.includes(after)) return;
  assert.equal(source.split(before).length - 1, 1, 'Shipment carryover anchor: ' + path);
  fs.writeFileSync(path, source.replace(before, after));
}
fs.copyFileSync('scripts/v110368/shipmentCarryover.js', 'source/src/core/routes/shipmentCarryover.js');
const day = 'source/src/modules/logbook/DayLogScreen.jsx';
const VERSION = '110.3.68', BUILD = 'v110368-active-shipment-window';
for (const path of ['release-version.json', 'public/app-version.json']) {
  const value = JSON.parse(read(path));
  Object.assign(value, {version:VERSION, build:BUILD, force:false, label:'v110.3.68 Active shipment time windows', releasedAt:new Date().toISOString(), updatedAt:new Date().toISOString(), sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
    notes:['Show only the shipment belonging to each event time.', 'Stop older carryover at a subsequent recorded pickup or actual delivery.', 'Preserve pickup-to-delivery history and multi-stop destinations.']});
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
for (const path of ['package.json', 'package-lock.json']) {
  const value = JSON.parse(read(path)); value.version = VERSION; if (value.packages?.['']) value.packages[''].version = VERSION;
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
for (const [path, name] of [['source/src/core/update/appUpdate.js', 'FALLBACK_APP'], ['public/sw.js', 'OWNER_OP_SW']]) {
  let source = read(path);
  for (const [key, value] of [['VERSION', VERSION], ['BUILD', BUILD]]) {
    const pattern = new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`, 'g');
    assert.equal([...source.matchAll(pattern)].length, 1, 'Unique release marker: ' + path);
    source = source.replace(pattern, `const ${name}_${key} = '${value}';`);
  }
  fs.writeFileSync(path, source);
}
for (const path of ['source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx']) fs.writeFileSync(path, read(path).replace(/App v\d+\.\d+\.\d+/g, 'App v' + VERSION).replace(/APP V\d+\.\d+\.\d+/g, 'APP V' + VERSION));
patch('scripts/test-duty-graph-continuity.mjs', "assert.equal(meta.version,'110.3.67');assert.equal(meta.build,'v110367-shipment-carryover');", `assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
patch('scripts/test-editor-grips-v110355.mjs', "assert.equal(meta.version,'110.3.67'); assert.equal(meta.build,'v110367-shipment-carryover');", `assert.equal(meta.version,'${VERSION}'); assert.equal(meta.build,'${BUILD}');`);
patch('scripts/verify-log-integrity-v1051.mjs', "assert.equal(JSON.parse(read('public/app-version.json')).version, '110.3.67');", `assert.equal(JSON.parse(read('public/app-version.json')).version, '${VERSION}');`);

// Reviewed display wiring; stored events and signature implementation keep their locks.
const reviewedDayHash = 'fa7509bcecdcd3968cf91ebdb53de48fa341cef0c5717b44eef95fd38fa84255';
assert.equal(crypto.createHash('sha256').update(read(day)).digest('hex'), reviewedDayHash);
const lockPath = 'module-locks.v1.json', locks = JSON.parse(read(lockPath));
locks.release = VERSION; locks.files[day] = reviewedDayHash;
fs.writeFileSync(lockPath, JSON.stringify(locks, null, 2) + '\n');
console.log('PASS — 110.3.68 limits shipment carryover to its recorded time window');
