import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const child = path.join(here, 'verify-logbook-load-integrity-v105-child.mjs');
const result = spawnSync(process.execPath, [child], {
  cwd:path.resolve(here, '..'),
  encoding:'utf8',
  stdio:'pipe',
  env:{ ...process.env, ROAD_READY_V105_FRESH_PROCESS:'1' },
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) {
  throw new Error(`verify-logbook-load-integrity-v105 child failed with exit ${result.status}`);
}
