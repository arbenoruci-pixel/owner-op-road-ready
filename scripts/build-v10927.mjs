import { spawnSync } from 'node:child_process';

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
run(process.execPath, ['--input-type=module', '-e', `
  import fs from 'node:fs';

  const guideTarget = 'source/src/modules/loads/loadGuideV103.js';
  let guideSource = fs.readFileSync(guideTarget, 'utf8');
  const start = guideSource.indexOf("  const characters = Object.keys(value)");
  const end = guideSource.indexOf("  return text(characters);", start);
  if (start < 0 || end < 0) throw new Error('v109.4.4 checklist fallback patch target missing');
  const replacement = [
    "  const characters = Object.values(value)",
    "    .filter(item => typeof item === 'string' || typeof item === 'number')",
    "    .map(item => String(item))",
    "    .join('');",
  ].join('\\n');
  guideSource = guideSource.slice(0, start) + replacement + '\\n' + guideSource.slice(end);

  const resolveBefore = "    return { ...step, checklist:normalizeChecklist(step.checklist), complete, completedAt:guide.manualDone?.[step.id] || null };";
  const resolveAfter = [
    "    const checklist = (Array.isArray(step.checklist) ? step.checklist : []).map(item => {",
    "      if (typeof item === 'string' || typeof item === 'number') return String(item).trim();",
    "      if (!item || typeof item !== 'object') return '';",
    "      if (typeof item.text === 'string') return item.text.trim();",
    "      if (typeof item.label === 'string') return item.label.trim();",
    "      return Object.values(item).filter(value => typeof value === 'string' || typeof value === 'number').map(value => String(value)).join('').trim();",
    "    }).filter(Boolean);",
    "    return { ...step, checklist, complete, completedAt:guide.manualDone?.[step.id] || null };",
  ].join('\\n');
  if (!guideSource.includes(resolveBefore)) throw new Error('v109.4.4 resolve checklist patch target missing');
  guideSource = guideSource.replace(resolveBefore, resolveAfter);
  fs.writeFileSync(guideTarget, guideSource);

  const uiTarget = 'source/src/modules/loads/DriverLoadGuideV103.jsx';
  let uiSource = fs.readFileSync(uiTarget, 'utf8');
  const whenMarker = '\\nfunction when(step = {}) {';
  if (!uiSource.includes('function checklistText(value')) {
    const helper = [
      '',
      "function checklistText(value = '') {",
      "  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();",
      "  if (!value || typeof value !== 'object') return '';",
      "  if (typeof value.text === 'string') return value.text.trim();",
      "  if (typeof value.label === 'string') return value.label.trim();",
      "  return Object.values(value).filter(item => typeof item === 'string' || typeof item === 'number').map(item => String(item)).join('').trim();",
      '}',
      '',
      'function normalizeChecklistUi(values = []) {',
      '  return (Array.isArray(values) ? values : []).map(checklistText).filter(Boolean);',
      '}',
      '',
    ].join('\\n');
    if (!uiSource.includes(whenMarker)) throw new Error('v109.4.4 UI checklist helper target missing');
    uiSource = uiSource.replace(whenMarker, helper + 'function when(step = {}) {');
  }
  if (!uiSource.includes('step.checklist')) throw new Error('v109.4.4 UI checklist references missing');
  uiSource = uiSource.split('step.checklist').join('normalizeChecklistUi(step.checklist)');
  fs.writeFileSync(uiTarget, uiSource);

  const verifyTarget = 'scripts/verify-v10943-auto-upright.mjs';
  let verifySource = fs.readFileSync(verifyTarget, 'utf8');
  const verifyStart = verifySource.indexOf("const characterObject = Object.fromEntries");
  const verifyEnd = verifySource.indexOf("const closedState =", verifyStart);
  if (verifyStart < 0 || verifyEnd < 0) throw new Error('v109.4.4 checklist verifier target missing');
  const verifyReplacement = [
    "const guideUiSource = read('source/src/modules/loads/DriverLoadGuideV103.jsx');",
    "assert.ok(guideUiSource.includes('function checklistText(value'), 'guide UI must normalize legacy checklist values');",
    "assert.ok(guideUiSource.includes('normalizeChecklistUi(step.checklist)'), 'guide checklist references must use normalized text');",
    '',
  ].join('\\n');
  verifySource = verifySource.slice(0, verifyStart) + verifyReplacement + verifySource.slice(verifyEnd);
  fs.writeFileSync(verifyTarget, verifySource);

  console.log('PASS — v109.4.4 checklist objects are normalized before every guide render');
`]);
run(process.execPath, ['--input-type=module', '-e', `
  import fs from 'node:fs';
  const VERSION = '109.4.5';
  const BUILD = 'v10945-recertification-sign-loop';

  const appTarget = 'source/src/app/App.jsx';
  let app = fs.readFileSync(appTarget, 'utf8');
  const before = "        const { signatureDataUrl, ...compactDaySignature } = existingDaySignature;";
  const after = [
    "        const {",
    "          signatureDataUrl,",
    "          needsRecertification,",
    "          changedAfterSignAt,",
    "          integrityRepairReason,",
    "          repairReason,",
    "          ...compactDaySignature",
    "        } = existingDaySignature;",
  ].join('\\n');
  if (!app.includes(before) && !app.includes(after)) throw new Error('v109.4.5 signing cleanup target missing');
  if (app.includes(before)) app = app.replace(before, after);
  fs.writeFileSync(appTarget, app);

  const pkgPath = 'package.json';
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = VERSION;
  pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\\n');

  const lockPath = 'package-lock.json';
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = VERSION;
  if (lock.packages?.['']) {
    lock.packages[''].version = VERSION;
    lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
  }
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\\n');

  const releasedAt = new Date().toISOString();
  fs.writeFileSync('public/app-version.json', JSON.stringify({
    version:VERSION,
    build:BUILD,
    releasedAt,
    updatedAt:releasedAt,
    label:'v109.4.5 Certification Loop Fix',
    force:true,
    notes:[
      'Clears stale needs-recertification metadata when the driver signs a reviewed log day again.',
      'Prevents July 15, July 16, July 17 and similar repaired days from returning to Review immediately after signing.',
      'Keeps the signed log events, duty times, locations, inspection records and prior audit history unchanged.',
      'Retains v109.4.4 Driver Load Guide closeout and Scanner 0.5.3 behavior.'
    ]
  }, null, 2) + '\\n');

  const swPath = 'public/sw.js';
  let sw = fs.readFileSync(swPath, 'utf8');
  sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, "const OWNER_OP_SW_VERSION = '109.4.5';");
  sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, "const OWNER_OP_SW_BUILD = 'v10945-recertification-sign-loop';");
  fs.writeFileSync(swPath, sw);

  const updatePath = 'source/src/core/update/appUpdate.js';
  let update = fs.readFileSync(updatePath, 'utf8');
  update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, "const FALLBACK_APP_VERSION = '109.4.5';");
  update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, "const FALLBACK_APP_BUILD = 'v10945-recertification-sign-loop';");
  fs.writeFileSync(updatePath, update);

  const verifyPath = 'scripts/verify-v10943-auto-upright.mjs';
  let verify = fs.readFileSync(verifyPath, 'utf8');
  verify = verify.replace("assert.equal(release.version, '109.4.4');", "assert.equal(release.version, '109.4.5');");
  verify = verify.replace("assert.equal(release.build, 'v10944-load-guide-closeout');", "assert.equal(release.build, 'v10945-recertification-sign-loop');");
  verify = verify.replace("assert.equal(packageJson.version, '109.4.4');", "assert.equal(packageJson.version, '109.4.5');");
  fs.writeFileSync(verifyPath, verify);

  if (!app.includes('needsRecertification,') || !app.includes('changedAfterSignAt,')) throw new Error('v109.4.5 signing cleanup not installed');
  console.log('PASS — v109.4.5 recertification flags clear after successful signing');
`]);
run(process.execPath, ['scripts/verify-v10943-auto-upright.mjs']);
run('npx', ['next', 'build']);
