import { spawnSync } from 'node:child_process';

// v109.6.1: production SmartScanSheetV105 uses the isolated document router.
function run(command, args = []) {
  const result = spawnSync(command, args, { stdio:'inherit', shell:false });
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
run(process.execPath, ['scripts/apply-v10935-reliable-update.mjs']);
run(process.execPath, ['scripts/verify-v10935-reliable-update.mjs']);
run(process.execPath, ['scripts/apply-v10936-reference-quality.mjs']);
run(process.execPath, ['scripts/verify-v10936-reference-quality.mjs']);
run(process.execPath, ['scripts/apply-v10937-update-reload-loop.mjs']);
run(process.execPath, ['scripts/verify-v10937-update-reload-loop.mjs']);
run(process.execPath, ['scripts/apply-v10938-hybrid-clean-quality.mjs']);
run(process.execPath, ['scripts/verify-v10938-hybrid-clean-quality.mjs']);
run(process.execPath, ['scripts/apply-v10939-fidelity-lock.mjs']);
run(process.execPath, ['scripts/verify-v10939-fidelity-lock.mjs']);
run(process.execPath, ['scripts/apply-v10940-layered-render.mjs']);
run(process.execPath, ['scripts/verify-v10940-layered-render.mjs']);
run(process.execPath, ['scripts/apply-v10941-single-fidelity-pass.mjs']);
run(process.execPath, ['scripts/apply-v10942-neutral-safe-render.mjs']);
run(process.execPath, ['scripts/apply-v10943-auto-upright.mjs']);
run(process.execPath, ['scripts/apply-v10944-load-guide-closeout.mjs']);
run(process.execPath, ['scripts/apply-v10946-metadata-recertification.mjs']);
run(process.execPath, ['scripts/apply-v10947-signed-log-stability.mjs']);
run(process.execPath, ['scripts/apply-v10948-inspection-persistence.mjs']);
run(process.execPath, ['scripts/apply-v10949-inspection-write-order.mjs']);
run(process.execPath, ['scripts/apply-v10951-multireason-inspection-root-fix.mjs']);
run(process.execPath, ['scripts/verify-v10951-multireason-inspection-root-fix.mjs']);
run(process.execPath, ['scripts/apply-v10952-visible-app-version.mjs']);
run(process.execPath, ['scripts/apply-v10953-undo-startup-isolation.mjs']);
run(process.execPath, ['scripts/apply-v10955-inspection-foundation-root-fix.mjs']);
run(process.execPath, ['scripts/verify-v10955-inspection-foundation-root-fix.mjs']);
run(process.execPath, ['scripts/apply-v10956-fast-quality-strategy.mjs']);
run(process.execPath, ['scripts/verify-v10956-fast-quality-strategy.mjs']);
run(process.execPath, ['scripts/verify-v10943-auto-upright.mjs']);
run(process.execPath, ['scripts/prepare-v10957-pod-anchor.mjs']);
run(process.execPath, ['scripts/apply-v10957-ratecon-classifier.mjs']);
run(process.execPath, ['scripts/verify-v10957-ratecon-classifier.mjs']);
run(process.execPath, ['scripts/run-v10958-completed-load-command-closeout.mjs']);
run(process.execPath, ['scripts/verify-v10958-completed-load-command-closeout.mjs']);
run(process.execPath, ['scripts/apply-v10959-isolated-document-engines.mjs']);
run(process.execPath, ['scripts/verify-v10959-isolated-document-engines.mjs']);
run(process.execPath, ['scripts/apply-v10960-iphone-force-update.mjs']);
run(process.execPath, ['scripts/verify-v10960-iphone-force-update.mjs']);
run(process.execPath, ['scripts/apply-v10961-ratecon-engine-v11.mjs']);
run(process.execPath, ['scripts/apply-v10961-production-v105-router.mjs']);
run(process.execPath, ['scripts/verify-v10961-ratecon-engine-v11.mjs']);
run('npx', ['next', 'build']);
