import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');
function patch(path, before, after) {
  const source = read(path);
  if (source.includes(after)) return;
  assert.equal(source.split(before).length - 1, 1, `110.3.13 anchor changed: ${path}`);
  fs.writeFileSync(path, source.replace(before, after));
}

const module = 'source/src/modules/logbook/eventEditingV110.js';
fs.copyFileSync('scripts/v110313/elapsedInsertV110313.js', 'source/src/modules/logbook/elapsedInsertV110313.js');
if (!read(module).includes('previewElapsedInsertV110313')) {
  patch(module, 'export function previewLogbookInsertOverride(', 'function previewLogbookInsertBaseV110313(');
  fs.writeFileSync(module, "import { previewElapsedInsertV110313 } from './elapsedInsertV110313.js';\n" + read(module) + `
export function previewLogbookInsertOverride(state, command, at = new Date()) {
  return previewElapsedInsertV110313(state, command, at, {
    preview: previewLogbookInsertBaseV110313,
    project: projectLogbookEvents,
    clock: logbookClock,
    summarize: changedSummary,
    isStoredEvent: active,
  });
}
`);
}

const VERSION = '110.3.13', BUILD = 'v110313-elapsed-manual-insert';
patch('scripts/test-duty-graph-continuity.mjs',
  "assert.equal(meta.version,'110.3.12');assert.equal(meta.build,'v110312-saved-scan-recovery');",
  `assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
for (const path of ['package.json', 'package-lock.json']) {
  const data = JSON.parse(read(path));
  data.version = VERSION;
  if (data.packages?.['']) data.packages[''].version = VERSION;
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}
for (const path of ['release-version.json', 'public/app-version.json']) {
  const data = JSON.parse(read(path));
  Object.assign(data, {
    version: VERSION, build: BUILD, force: false,
    sourceCommit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
    label: 'v110.3.13 Elapsed manual Insert',
    notes: ['Insert can replace elapsed time inside the current OFF, SB or ON event.',
      'The current status and its live continuation are retained after Save.',
      'Live Driving, automatic Driving and future time inside the active event remain protected.'],
  });
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}
for (const [path, name] of [['source/src/core/update/appUpdate.js', 'FALLBACK_APP'], ['public/sw.js', 'OWNER_OP_SW']]) {
  fs.writeFileSync(path, read(path)
    .replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`), `$1'${VERSION}'`)
    .replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`), `$1'${BUILD}'`));
}
for (const path of ['source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx']) {
  fs.writeFileSync(path, read(path).replace(/App v\d+\.\d+\.\d+/g, `App v${VERSION}`).replace(/APP V\d+\.\d+\.\d+/g, `APP V${VERSION}`));
}
console.log('PASS — elapsed OFF/SB/ON Insert 110.3.13 applied');
