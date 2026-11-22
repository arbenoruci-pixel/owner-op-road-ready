import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const readJson = file => JSON.parse(read(file));
const saveJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
export function advanceRelease({ from, version, slug, label, notes }) {
  const previous = readJson('release-version.json');
  assert.equal(previous.version, from);
  assert.match(previous.sourceCommit, /^[a-f0-9]{40}$/);

  const build = 'v' + version.replaceAll('.', '') + '-' + slug + '-' + previous.sourceCommit.slice(0, 12);

  for (const file of ['release-version.json', 'public/app-version.json']) {
    saveJson(file, {
      ...readJson(file), version, build, force: false,
      label, notes,
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
}
