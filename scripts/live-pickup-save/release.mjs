import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const read = file => fs.readFileSync(file, 'utf8');
const readJson = file => JSON.parse(read(file));
const saveJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
// Preserve the legacy installers' exact-byte rerun checks for the reviewed editor.
const editor = 'source/src/modules/logbook/eventEditingV110.js';
const priorEditorHash = 'e21061950b1ed45e8c9cb037f98e4d1168155a9bf6fcdfb034378a501000017e';
const pickupEditorHash = '60f7402302dc26155d3b31bd2a46bd632cddd7116266db9505b9d6dd1f2254b6';
assert.equal(createHash('sha256').update(read(editor)).digest('hex'), pickupEditorHash);
const beforeGuard = JSON.stringify(editor) + ':' + JSON.stringify(priorEditorHash);
const afterGuard = JSON.stringify(editor) + ':' + JSON.stringify(pickupEditorHash);
const compatibility = ['install', 'finish-mobile', 'finish-interaction'].map(stage => {
  const file = 'scripts/v110378/' + stage + '.mjs';
  const source = read(file);
  assert.equal(source.split(beforeGuard).length, 2, 'Expected preceding editor guard in ' + file);
  return [file, source.replace(beforeGuard, afterGuard)];
});
for (const [file, source] of compatibility) fs.writeFileSync(file, source);

const previous = readJson('release-version.json');
assert.equal(previous.version, '110.4.135');
assert.match(previous.sourceCommit, /^[a-f0-9]{40}$/);

const version = '110.4.136';
const build = 'v1104136-live-pickup-save-' + previous.sourceCommit.slice(0, 12);

for (const file of ['release-version.json', 'public/app-version.json']) {
  saveJson(file, {
    ...readJson(file), version, build, force: false,
    label: 'Live pickup save and compact Home',
    notes: ['Keep the exact live pickup editable when only its active clock has advanced; preserve all saved minutes and reject other concurrent changes.', 'Recent loads, gross revenue and additional tools start collapsed on Home.'],
  });
}
for (const file of ['package.json', 'package-lock.json']) {
  const value = readJson(file);
  value.version = version;
  if (value.packages?.['']) value.packages[''].version = version;
  saveJson(file, value);
}
saveJson('module-locks.v1.json', { ...readJson('module-locks.v1.json'), release: version });

// Keep the installed app, worker, release indicators and version checks in sync.
for (const file of [
  'source/src/core/update/appUpdate.js', 'public/sw.js', 'source/src/shared/ui/ToolsSheet.jsx',
  'source/src/modules/home/HomeScreen.jsx', 'source/src/modules/home/DriverDashboard.jsx',
  'lib/owner-op-cloud/cloudMirrorV110450.js', 'scripts/test-duty-graph-continuity.mjs',
  'scripts/test-editor-grips-v110355.mjs', 'scripts/verify-log-integrity-v1051.mjs',
  'scripts/test-document-continuity-integration-v110375.mjs',
]) {
  fs.writeFileSync(file, read(file).replaceAll(previous.version, version).replaceAll(previous.build, build));
}
