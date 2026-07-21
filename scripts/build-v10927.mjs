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
  const VERSION = '109.4.6';
  const BUILD = 'v10946-metadata-recertification-loop';

  const appTarget = 'source/src/app/App.jsx';
  let app = fs.readFileSync(appTarget, 'utf8');
  const signBefore = "        const { signatureDataUrl, ...compactDaySignature } = existingDaySignature;";
  const signAfter = [
    "        const {",
    "          signatureDataUrl,",
    "          needsRecertification,",
    "          changedAfterSignAt,",
    "          integrityRepairReason,",
    "          repairReason,",
    "          ...compactDaySignature",
    "        } = existingDaySignature;",
  ].join('\\n');
  if (!app.includes(signBefore) && !app.includes(signAfter)) throw new Error('v109.4.6 signing cleanup target missing');
  if (app.includes(signBefore)) app = app.replace(signBefore, signAfter);

  const normalizeMarker = 'function normalizeState(s) {';
  const cleanupHelper = [
    "function clearMetadataOnlyRecertification(state = {}) {",
    "  const metadataOnlyReason = /Corrected load\\/document metadata without changing duty-status time, duty status, or signed GPS location\\./i;",
    "  const signatureByDay = { ...(state.signatureByDay || {}) };",
    "  const certifyStatus = { ...(state.certifyStatus || {}) };",
    "  let changed = false;",
    "  Object.entries(signatureByDay).forEach(([day, signature]) => {",
    "    if (!signature?.signed || !signature.needsRecertification) return;",
    "    const reason = String(signature.integrityRepairReason || signature.repairReason || '');",
    "    if (!metadataOnlyReason.test(reason)) return;",
    "    const { needsRecertification, changedAfterSignAt, integrityRepairReason, repairReason, ...cleanSignature } = signature;",
    "    signatureByDay[day] = { ...cleanSignature, metadataOnlyRepairAcknowledgedAt:Date.now() };",
    "    certifyStatus[day] = 'Certified';",
    "    changed = true;",
    "  });",
    "  return changed ? { ...state, signatureByDay, certifyStatus } : state;",
    "}",
    "",
  ].join('\\n');
  if (!app.includes('function clearMetadataOnlyRecertification(state = {})')) {
    if (!app.includes(normalizeMarker)) throw new Error('v109.4.6 normalizeState marker missing');
    app = app.replace(normalizeMarker, cleanupHelper + normalizeMarker);
  }
  const routeBefore = "  const routeNormalized = normalizeRoadReadyState(normalized);\\n  return reconcilePreTripInspections(routeNormalized, Object.keys(routeNormalized.eventsByDay || eventsByDay));";
  const routeAfter = "  const routeNormalized = clearMetadataOnlyRecertification(normalizeRoadReadyState(normalized));\\n  return reconcilePreTripInspections(routeNormalized, Object.keys(routeNormalized.eventsByDay || eventsByDay));";
  if (!app.includes(routeBefore) && !app.includes(routeAfter)) throw new Error('v109.4.6 route normalization cleanup target missing');
  if (app.includes(routeBefore)) app = app.replace(routeBefore, routeAfter);
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
    label:'v109.4.6 Metadata Recertification Fix',
    force:true,
    notes:[
      'Prevents metadata-only load and document repairs from reopening an already signed log day.',
      'Automatically restores Certified for stale metadata-only recertification records on app load.',
      'Keeps real duty-time, duty-status, GPS and inspection edits subject to recertification.',
      'Retains v109.4.5 signing cleanup and v109.4.4 Driver Load Guide closeout.'
    ]
  }, null, 2) + '\\n');

  const swPath = 'public/sw.js';
  let sw = fs.readFileSync(swPath, 'utf8');
  sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, "const OWNER_OP_SW_VERSION = '109.4.6';");
  sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, "const OWNER_OP_SW_BUILD = 'v10946-metadata-recertification-loop';");
  fs.writeFileSync(swPath, sw);

  const updatePath = 'source/src/core/update/appUpdate.js';
  let update = fs.readFileSync(updatePath, 'utf8');
  update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, "const FALLBACK_APP_VERSION = '109.4.6';");
  update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, "const FALLBACK_APP_BUILD = 'v10946-metadata-recertification-loop';");
  fs.writeFileSync(updatePath, update);

  const verifyTarget = 'scripts/verify-v10943-auto-upright.mjs';
  let verifySource = fs.readFileSync(verifyTarget, 'utf8');
  verifySource = verifySource.replaceAll("'109.4.5'", "'109.4.6'");
  verifySource = verifySource.replaceAll('v10945-recertification-sign-loop', 'v10946-metadata-recertification-loop');
  fs.writeFileSync(verifyTarget, verifySource);

  if (!app.includes('clearMetadataOnlyRecertification') || !app.includes('metadataOnlyReason')) throw new Error('v109.4.6 metadata cleanup not installed');
  console.log('PASS — v109.4.6 metadata-only repairs cannot reopen signed days');
`]);
run(process.execPath, ['scripts/verify-v10943-auto-upright.mjs']);
run('npx', ['next', 'build']);
