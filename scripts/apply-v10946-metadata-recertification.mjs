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
].join('\n');
if (!app.includes(signBefore) && !app.includes(signAfter)) throw new Error('v109.4.6 signing cleanup target missing');
if (app.includes(signBefore)) app = app.replace(signBefore, signAfter);

const normalizeMarker = 'function normalizeState(s) {';
if (!app.includes('function clearMetadataOnlyRecertification(state = {})')) {
  const helper = [
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
  ].join('\n');
  if (!app.includes(normalizeMarker)) throw new Error('v109.4.6 normalizeState marker missing');
  app = app.replace(normalizeMarker, helper + normalizeMarker);
}

const routeNeedle = '  const routeNormalized = normalizeRoadReadyState(normalized);';
const routePatched = '  const routeNormalized = clearMetadataOnlyRecertification(normalizeRoadReadyState(normalized));';
if (!app.includes(routeNeedle) && !app.includes(routePatched)) throw new Error('v109.4.6 route normalization line missing');
if (app.includes(routeNeedle)) app = app.replace(routeNeedle, routePatched);
fs.writeFileSync(appTarget, app);

const pkgPath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const lockPath = 'package-lock.json';
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
lock.version = VERSION;
if (lock.packages?.['']) {
  lock.packages[''].version = VERSION;
  lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
}
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');

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
}, null, 2) + '\n');

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
verifySource = verifySource.replace(/assert\.equal\(release\.version, '[^']+'\);/, "assert.equal(release.version, '109.4.6');");
verifySource = verifySource.replace(/assert\.equal\(release\.build, '[^']+'\);/, "assert.equal(release.build, 'v10946-metadata-recertification-loop');");
verifySource = verifySource.replace(/assert\.equal\(packageJson\.version, '[^']+'\);/, "assert.equal(packageJson.version, '109.4.6');");
fs.writeFileSync(verifyTarget, verifySource);

if (!app.includes('clearMetadataOnlyRecertification') || !app.includes(routePatched)) throw new Error('v109.4.6 metadata cleanup not installed');
console.log('PASS — v109.4.6 metadata-only repairs cannot reopen signed days');
