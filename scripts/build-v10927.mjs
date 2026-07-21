import { spawnSync } from 'node:child_process';

function run(command, args = []) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run('npm', ['run', 'prebuild']);
run(process.execPath, ['scripts/apply-v10925-edit-duty-multitask-save.mjs']);
run(process.execPath, ['scripts/prepare-v10926-runtime.mjs']);
run(process.execPath, ['scripts/apply-v10926-event-reasons-source-of-truth.mjs']);
run(process.execPath, ['scripts/apply-v10927-reset-pretrip-reasons.mjs']);
run(process.execPath, ['scripts/apply-v10930-scanner-lab-041.mjs']);
run(process.execPath, ['scripts/verify-v10930-scanner-lab-041.mjs']);
run(process.execPath, ['scripts/apply-v10934-forced-update-bootstrap.mjs']);
run(process.execPath, ['scripts/verify-v10934-forced-update-bootstrap.mjs']);
run('npx', ['next', 'build']);
