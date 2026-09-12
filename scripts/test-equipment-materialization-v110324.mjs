import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

// Run immediately before the equipment finalizer against the actual production
// materialization output, including v105.2's labels and expanded component props.
const status = 'source/src/modules/status/StatusWorkflowSheet.jsx';
const finalizer = 'scripts/finalize-equipment-mode-v110324.mjs';
const before = fs.readFileSync(status, 'utf8');
assert.match(before, /'Drop Load \/ Trailer', 'Hook \/ Pickup Trailer'/);
assert.match(before, /preferredReason = '', preferredDocument = null/);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'equipment-materialization-'));
try {
  for (const file of [status, finalizer, 'scripts/v110324/equipmentMode.js',
    'release-version.json', 'public/app-version.json', 'package.json', 'package-lock.json',
    'source/src/core/update/appUpdate.js', 'public/sw.js',
    'source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx',
    'scripts/test-duty-graph-continuity.mjs']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive:true });
    fs.copyFileSync(file, path.join(root, file));
  }
  const run = file => spawnSync(process.execPath, [file], { cwd:root, encoding:'utf8' });
  // Reproduce the reviewed failure by restricting the patch to the old anchors.
  const stale = fs.readFileSync(finalizer, 'utf8')
    .split('\n').filter(line => !line.trimStart().startsWith('"const onReasons =') || !line.includes('Hook / Pickup Trailer'))
    .filter(line => !line.trimStart().startsWith('"export default function StatusWorkflowSheet'))
    .join('\n');
  fs.writeFileSync(path.join(root, 'scripts/stale-equipment-finalizer.mjs'), stale);
  const failed = run('scripts/stale-equipment-finalizer.mjs');
  assert.notEqual(failed.status, 0, 'pre-materialization anchors must reproduce the P1');
  assert.match(failed.stderr, /Equipment mode anchors?: source\/src\/modules\/status\/StatusWorkflowSheet.jsx/);
  fs.writeFileSync(path.join(root, status), before);

  const result = run(finalizer);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const after = fs.readFileSync(path.join(root, status), 'utf8');
  assert.match(after, /preferredReason = '', preferredDocument = null/);
  // Exercise the generated reason picker, including the production-only hook action.
  assert.match(after, /reasonList\(status, intermodalMode\)\.map/);
  assert.match(after, /const equipmentDropSelected = intermodalMode &&/);
  const reasons = after.slice(after.indexOf('const onReasons ='), after.indexOf('function reasonText'));
  const context = vm.createContext({});
  vm.runInContext(reasons + '\nthis.reasons = reasonList;', context);
  const trailer = Array.from(context.reasons('ON', false));
  const intermodal = Array.from(context.reasons('ON', true));
  assert.ok(trailer.includes('Drop Load / Trailer') && trailer.includes('Hook / Pickup Trailer'));
  assert.ok(!trailer.includes('Drop Off') && !trailer.includes('Drop & Hook'));
  assert.ok(intermodal.includes('Drop Off') && intermodal.includes('Drop & Hook'));
  assert.ok(!intermodal.includes('Drop Load / Trailer') && !intermodal.includes('Hook / Pickup Trailer'));
  assert.equal(run(finalizer).status, 0, 'finalizer can be repeated');
  assert.equal(fs.readFileSync(path.join(root, status), 'utf8'), after, 'repeat does not duplicate patches');
  assert.equal(fs.readFileSync(status, 'utf8'), before, 'regression fixture leaves build input untouched');
  console.log('PASS — production equipment anchors: reviewed failure reproduced, trailer/intermodal actions and repeat verified');
} finally {
  fs.rmSync(root, { recursive:true, force:true });
}
