import fs from 'node:fs';

const VERSION = '109.4.7';
const BUILD = 'v10947-signed-log-stability';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`v109.4.7 patch target missing: ${label}`);
  return source.replace(before, after);
}

const appTarget = 'source/src/app/App.jsx';
let app = read(appTarget);

const metadataReasonBefore = "  const metadataOnlyReason = /Corrected load\\/document metadata without changing duty-status time, duty status, or signed GPS location\\./i;";
const metadataReasonAfter = "  const metadataOnlyReason = /(?:Corrected load\\/document metadata without changing duty-status time, duty status, or signed GPS location|Removed stale Delivery mission text from a verified Pre-trip event|metadata[^.]*without changing duty-status|Duty time, status and location were preserved)/i;";
app = replaceOnce(app, metadataReasonBefore, metadataReasonAfter, 'metadata-only reason coverage');

const cleanupGuardBefore = "    if (!signature?.signed || !signature.needsRecertification) return;";
const cleanupGuardAfter = [
  "    const needsCleanup = signature?.needsRecertification || certifyStatus[day] === 'Needs Recertification';",
  "    if (!signature?.signed || !needsCleanup) return;",
].join('\n');
app = replaceOnce(app, cleanupGuardBefore, cleanupGuardAfter, 'metadata runtime cleanup guard');

const inspectionDeleteBefore = [
  "  if (isAutoPreTripInspection(previous)) {",
  "    const next = { ...inspectionByDay };",
  "    delete next[day];",
  "    return next;",
  "  }",
  "",
  "  return inspectionByDay;",
].join('\n');
const inspectionDeleteAfter = [
  "  // A completed driver-confirmed inspection is an audit record. Keep it even",
  "  // when a later route/text normalization temporarily cannot resolve its source event.",
  "  // Only discard an incomplete automatic placeholder.",
  "  if (isAutoPreTripInspection(previous) && !previous.complete) {",
  "    const next = { ...inspectionByDay };",
  "    delete next[day];",
  "    return next;",
  "  }",
  "",
  "  return inspectionByDay;",
].join('\n');
app = replaceOnce(app, inspectionDeleteBefore, inspectionDeleteAfter, 'completed inspection persistence');

if (!app.includes('const cleanedState = clearMetadataOnlyRecertification(state)')) {
  const saveNeedle = "    saveAppSnapshot(APP_STATE_KEY, state).catch(() => {});";
  const saveIndex = app.indexOf(saveNeedle);
  if (saveIndex < 0) throw new Error('v109.4.7 save snapshot marker missing');
  const runtimeCleanup = [
    "    // A late route/document repair may run after initial hydration. Remove only",
    "    // metadata-only recertification flags before they can be saved or displayed.",
    "    const cleanedState = clearMetadataOnlyRecertification(state);",
    "    if (cleanedState !== state) {",
    "      setState(cleanedState);",
    "      return;",
    "    }",
    "",
  ].join('\n');
  app = `${app.slice(0, saveIndex)}${runtimeCleanup}${app.slice(saveIndex)}`;
}
write(appTarget, app);

const homeTarget = 'source/src/modules/home/HomeScreen.jsx';
let home = read(homeTarget);
const homeStatusBefore = [
  "  const certified = state.certifyStatus?.[day] === 'Certified';",
  "  const issues = day < today ? validateLogForSigning(state, day).length : 0;",
].join('\n');
const homeStatusAfter = [
  "  const signed = !!state.signatureByDay?.[day]?.signed;",
  "  const needsRecertification = state.certifyStatus?.[day] === 'Needs Recertification';",
  "  const certified = state.certifyStatus?.[day] === 'Certified' && signed && !needsRecertification;",
  "  // Advisory review items remain available inside the day. A successfully signed",
  "  // and Certified row must stay visibly Signed until a real edit requires recertification.",
  "  const issues = day < today && !certified ? validateLogForSigning(state, day).length : 0;",
].join('\n');
home = replaceOnce(home, homeStatusBefore, homeStatusAfter, 'Recent Logs certified status priority');

const rowBefore = "      <span className={issues ? 'command-log-state warn' : certified ? 'command-log-state done' : 'command-log-state'}>{issues ? `${issues} review` : certified ? 'Signed' : day === today ? 'Active' : 'Open'}</span>";
const rowAfter = "      <span className={certified ? 'command-log-state done' : issues ? 'command-log-state warn' : 'command-log-state'}>{certified ? 'Signed' : issues ? `${issues} review` : day === today ? 'Active' : 'Open'}</span>";
home = replaceOnce(home, rowBefore, rowAfter, 'Recent Logs Signed display priority');
write(homeTarget, home);

const pkgPath = 'package.json';
const pkg = JSON.parse(read(pkgPath));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
write(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const lockPath = 'package-lock.json';
const lock = JSON.parse(read(lockPath));
lock.version = VERSION;
if (lock.packages?.['']) {
  lock.packages[''].version = VERSION;
  lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
}
write(lockPath, JSON.stringify(lock, null, 2) + '\n');

const releasedAt = new Date().toISOString();
write('public/app-version.json', JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt,
  updatedAt:releasedAt,
  label:'v109.4.7 Signed Log Stability',
  force:true,
  notes:[
    'Keeps a successfully signed and Certified log visibly Signed in Recent Log Days.',
    'Advisory checks remain visible inside the log without replacing the certification status in the list.',
    'Cleans metadata-only recertification flags whenever they reappear during runtime.',
    'Preserves completed driver-confirmed inspection sheets across reload and route normalization.'
  ]
}, null, 2) + '\n');

const swPath = 'public/sw.js';
let sw = read(swPath);
sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, `const OWNER_OP_SW_BUILD = '${BUILD}';`);
write(swPath, sw);

const updatePath = 'source/src/core/update/appUpdate.js';
let update = read(updatePath);
update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`);
update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, `const FALLBACK_APP_BUILD = '${BUILD}';`);
write(updatePath, update);

const verifyTarget = 'scripts/verify-v10943-auto-upright.mjs';
let verify = read(verifyTarget);
verify = verify.replace(/assert\.equal\(release\.version, '[^']+'\);/, `assert.equal(release.version, '${VERSION}');`);
verify = verify.replace(/assert\.equal\(release\.build, '[^']+'\);/, `assert.equal(release.build, '${BUILD}');`);
verify = verify.replace(/assert\.equal\(packageJson\.version, '[^']+'\);/, `assert.equal(packageJson.version, '${VERSION}');`);
write(verifyTarget, verify);

if (!app.includes('const cleanedState = clearMetadataOnlyRecertification(state)')) throw new Error('v109.4.7 runtime cleanup missing');
if (!app.includes('isAutoPreTripInspection(previous) && !previous.complete')) throw new Error('v109.4.7 inspection persistence missing');
if (!home.includes("const certified = state.certifyStatus?.[day] === 'Certified' && signed")) throw new Error('v109.4.7 signed row logic missing');
if (!home.includes("{certified ? 'Signed' : issues ? `${issues} review`")) throw new Error('v109.4.7 signed display priority missing');

console.log('PASS — v109.4.7 signed logs remain Signed and completed inspections persist');
